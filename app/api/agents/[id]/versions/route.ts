/**
 * エージェントバージョン管理 API
 * GET  /api/agents/[id]/versions — バージョン一覧
 * POST /api/agents/[id]/versions/[version]/deploy — デプロイ操作
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

/** バージョン一覧 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: agentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { data, error } = await auth.supabase
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .order("version", { ascending: false });

  if (error) {
    return NextResponse.json<ApiError>(
      { error: error.message, code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ versions: data ?? [] });
}

/** デプロイ操作 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: agentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const body = await request.json() as {
    version: number;
    action: "activate" | "canary" | "archive" | "rollback";
    canary_percent?: number;
  };

  if (!body.version || !body.action) {
    return NextResponse.json<ApiError>(
      { error: "version と action は必須です", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  switch (body.action) {
    case "activate": {
      // 既存のactiveをdraftに、指定バージョンをactiveに
      await auth.supabase
        .from("agent_versions")
        .update({ deploy_status: "draft", canary_percent: 0 })
        .eq("agent_id", agentId)
        .in("deploy_status", ["active", "canary"]);

      await auth.supabase
        .from("agent_versions")
        .update({ deploy_status: "active", canary_percent: 0 })
        .eq("agent_id", agentId)
        .eq("version", body.version);

      // メインエージェントのsystem_promptも更新
      const { data: ver } = await auth.supabase
        .from("agent_versions")
        .select("system_prompt, model, temperature, max_tokens")
        .eq("agent_id", agentId)
        .eq("version", body.version)
        .single();

      if (ver) {
        await auth.supabase
          .from("agents")
          .update({
            system_prompt: ver.system_prompt,
            model: ver.model,
            temperature: ver.temperature,
            max_tokens: ver.max_tokens,
          })
          .eq("id", agentId);
      }
      break;
    }

    case "canary": {
      const percent = Math.min(100, Math.max(1, body.canary_percent ?? 10));
      await auth.supabase
        .from("agent_versions")
        .update({ deploy_status: "canary", canary_percent: percent })
        .eq("agent_id", agentId)
        .eq("version", body.version);
      break;
    }

    case "archive": {
      await auth.supabase
        .from("agent_versions")
        .update({ deploy_status: "archived", canary_percent: 0 })
        .eq("agent_id", agentId)
        .eq("version", body.version);
      break;
    }

    case "rollback": {
      // 指定バージョンをactivateと同じ処理
      return NextResponse.json(
        await fetch(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: body.version, action: "activate" }),
        }).then((r) => r.json())
      );
    }
  }

  return NextResponse.json({ success: true, action: body.action, version: body.version });
}
