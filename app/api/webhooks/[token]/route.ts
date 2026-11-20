/**
 * Webhook受信エンドポイント
 * POST /api/webhooks/[token]
 *
 * 外部サービスからのWebhookを受け取り、紐づく自動化を実行する。
 * 認証はトークンベース（URLに含まれるランダムトークン）。
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { getAIProvider } from "@/lib/ai-client";
import { getAgentEnv } from "@/lib/cloudflare/env";
import { runWithActor } from "@/lib/cloudflare/auth";

type RouteParams = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { token } = await context.params;
  if (!/^[a-zA-Z0-9_-]{16,256}$/.test(token)) return NextResponse.json({ error: "Invalid webhook token" }, { status: 404 });
  const env = await getAgentEnv();
  const principal = await env.DB.prepare("SELECT a.created_by,a.workspace_id FROM webhook_tokens t JOIN automations a ON a.id=t.automation_id JOIN workspace_members m ON m.workspace_id=a.workspace_id AND m.user_id=a.created_by WHERE t.token=? AND a.is_active=1 AND m.role IN ('owner','admin','editor')").bind(token).first<{created_by:string;workspace_id:string}>();
  if (!principal) return NextResponse.json({ error: "Invalid webhook token" }, { status: 404 });
  return runWithActor({userId:principal.created_by,workspaceId:principal.workspace_id,method:'api_key'},()=>executeWebhook(request,context));
}

async function executeWebhook(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { token } = await params;

  try {
    // サービスロールでトークンを検証（RLSバイパス）
    const supabase = createServiceRoleClient();

    const { data: webhookToken, error: tokenError } = await supabase
      .from("webhook_tokens")
      .select("automation_id")
      .eq("token", token)
      .single();

    if (tokenError || !webhookToken) {
      return NextResponse.json({ error: "Invalid webhook token" }, { status: 404 });
    }

    // 自動化ルールを取得
    const { data: automation, error: autoError } = await supabase
      .from("automations")
      .select("*")
      .eq("id", webhookToken.automation_id)
      .single();

    if (autoError || !automation) {
      return NextResponse.json({ error: "Automation not found" }, { status: 404 });
    }

    if (!automation.is_active) {
      return NextResponse.json({ error: "Automation is disabled" }, { status: 403 });
    }

    if (!automation.agent_id) {
      return NextResponse.json({ error: "No agent configured" }, { status: 422 });
    }

    // Webhookペイロードを取得
    let payload: Record<string, string> = {};
    try {
      const body = await request.json();
      // ペイロードを文字列マップに変換
      if (typeof body === "object" && body !== null) {
        for (const [key, value] of Object.entries(body)) {
          payload[key] = typeof value === "string" ? value : JSON.stringify(value);
        }
      }
    } catch {
      // JSON以外のボディ
      const text = await request.text();
      if (text) payload.body = text;
    }

    // エージェントを取得
    const { data: agent } = await supabase
      .from("agents")
      .select("*")
      .eq("id", automation.agent_id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 入力を構築
    let input = automation.input_template ?? "";
    if (input) {
      input = Object.entries(payload).reduce(
        (result, [key, value]) => result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value),
        input
      );
    } else {
      input = payload.input ?? payload.body ?? JSON.stringify(payload);
    }

    // 実行ログを記録
    const { data: run } = await supabase
      .from("automation_runs")
      .insert({
        automation_id: automation.id,
        workspace_id: automation.workspace_id,
        status: "running",
      })
      .select("id")
      .single();

    try {
      const provider = await getAIProvider(agent.model, automation.workspace_id);
      const result = await provider.chat({
        model: agent.model,
        maxTokens: agent.max_tokens,
        systemPrompt: agent.system_prompt,
        temperature: agent.temperature,
        messages: [{ role: "user", content: input }],
      });

      const output = result.output;

      // 成功を記録
      if (run?.id) {
        await supabase.from("automation_runs").update({
          status: "success",
          output,
          ended_at: new Date().toISOString(),
        }).eq("id", run.id);
      }

      await supabase.from("automations").update({
        last_run_at: new Date().toISOString(),
        run_count: (automation.run_count ?? 0) + 1,
      }).eq("id", automation.id);

      return NextResponse.json({ status: "success", output });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Execution failed";
      if (run?.id) {
        await supabase.from("automation_runs").update({
          status: "error",
          error_message: errorMessage,
          ended_at: new Date().toISOString(),
        }).eq("id", run.id);
      }
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  } catch (err) {
    console.error("[Webhook]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
