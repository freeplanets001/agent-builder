/**
 * 自動化の手動実行 API
 * POST /api/automations/[id]/run
 *
 * スケジュール・Webhook・ワークフロー全種別に対応。
 * ワークフローの場合は各ステップを順次実行し、前ステップの出力を次に渡す。
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase-server";
import { getAIProvider } from "@/lib/ai-client";
import type { ApiError, WorkflowStep } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

/** テンプレート内の {{変数}} を展開する */
function expandTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value),
    template
  );
}

/** 1つのエージェントを実行して結果を返す */
async function runAgent(agentId: string, input: string): Promise<{ output: string; status: string }> {
  const adminSupabase = createServiceRoleClient();

  const { data: agent, error } = await adminSupabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (error || !agent) return { output: "", status: "error" };

  const provider = await getAIProvider(agent.model, agent.workspace_id);
  const result = await provider.chat({
    model: agent.model,
    maxTokens: agent.max_tokens,
    systemPrompt: agent.system_prompt,
    temperature: agent.temperature,
    messages: [{ role: "user", content: input }],
  });

  return { output: result.output, status: "success" };
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse("認証が必要です", "UNAUTHORIZED", 401);

    // 自動化ルールを取得
    const { data: automation, error: autoError } = await supabase
      .from("automations")
      .select("*")
      .eq("id", id)
      .single();

    if (autoError || !automation) return errorResponse("自動化が見つかりません", "NOT_FOUND", 404);

    // リクエストボディ（Webhookの場合にペイロードが来る）
    let payload: Record<string, string> = {};
    try {
      const body = await request.json() as Record<string, string>;
      payload = body;
    } catch {
      // ボディなしでもOK
    }

    // 実行ログを作成
    const { data: run } = await supabase
      .from("automation_runs")
      .insert({
        automation_id: id,
        workspace_id: automation.workspace_id,
        status: "running",
      })
      .select("id")
      .single();

    const runId = run?.id;
    const startedAt = Date.now();

    try {
      let finalOutput = "";
      let steps: Array<{ agent_id: string; input: string; output: string; status: string }> | null = null;

      if (automation.trigger_type === "workflow") {
        // ワークフロー: 各ステップを順次実行
        const config = automation.trigger_config as { steps?: WorkflowStep[] };
        const workflowSteps = config.steps ?? [];
        steps = [];
        let prevOutput = payload.input ?? "";

        for (const step of workflowSteps) {
          const input = expandTemplate(step.input_template, {
            ...payload,
            prev_output: prevOutput,
          });

          const result = await runAgent(step.agent_id, input);
          steps.push({ agent_id: step.agent_id, input, output: result.output, status: result.status });

          if (result.status === "error") {
            throw new Error(`ステップ ${step.agent_id} でエラーが発生しました`);
          }

          prevOutput = result.output;
        }

        finalOutput = prevOutput;
      } else {
        // スケジュール / Webhook: 単一エージェント実行
        if (!automation.agent_id) throw new Error("エージェントが設定されていません");

        const input = automation.input_template
          ? expandTemplate(automation.input_template, payload)
          : payload.input ?? "";

        if (!input.trim()) throw new Error("入力が空です");

        const result = await runAgent(automation.agent_id, input);
        finalOutput = result.output;
      }

      // 成功を記録
      if (runId) {
        await supabase.from("automation_runs").update({
          status: "success",
          output: finalOutput,
          steps,
          ended_at: new Date().toISOString(),
        }).eq("id", runId);
      }

      // 自動化のメタデータを更新
      await supabase.from("automations").update({
        last_run_at: new Date().toISOString(),
        run_count: (automation.run_count ?? 0) + 1,
      }).eq("id", id);

      return NextResponse.json({
        run_id: runId,
        status: "success",
        output: finalOutput,
        steps,
        latency_ms: Date.now() - startedAt,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "実行に失敗しました";

      if (runId) {
        await supabase.from("automation_runs").update({
          status: "error",
          error_message: errorMessage,
          ended_at: new Date().toISOString(),
        }).eq("id", runId);
      }

      return errorResponse(errorMessage, "EXECUTION_ERROR", 500);
    }
  } catch (err) {
    console.error("[POST /api/automations/run]:", err);
    return errorResponse(err instanceof Error ? err.message : "予期せぬエラー", "INTERNAL_SERVER_ERROR", 500);
  }
}
