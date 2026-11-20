/**
 * エージェント一覧取得・作成 API
 * GET  /api/agents  — ワークスペース内のエージェント一覧を返す
 * POST /api/agents  — 新しいエージェントを作成する
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { CreateAgentRequest, ApiError } from "@/lib/types";

// エラーレスポンスのヘルパー
function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated || !auth.supabase) {
      return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
    }
    const supabase = auth.supabase;

    // クエリパラメータの取得
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspace_id");
    const search = searchParams.get("search");
    const tag = searchParams.get("tag");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    // クエリ構築
    // 500エラーの原因切り分けのため、まずはシンプルなselectを試す
    let query = supabase
      .from("agents")
      .select("*", { count: "exact" });

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (tag) {
      query = query.contains("tags", [tag]);
    }

    query = query
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    console.log("[GET /api/agents] DBクエリ実行直前");
    const { data: agents, error, count } = await query;

    if (error) {
      console.error("[GET /api/agents] DBエラー:", error);
      return errorResponse(`DBエラー: ${error.message}`, "DB_ERROR", 500);
    }

    console.log("[GET /api/agents] 取得成功:", agents?.length ?? 0, "件");

    return NextResponse.json({
      agents: agents ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[GET /api/agents] 予期せぬエラー:", err);
    return errorResponse(
      err instanceof Error ? err.message : "予期せぬエラーが発生しました",
      "INTERNAL_SERVER_ERROR",
      500
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase || !auth.userId) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }
  const supabase = auth.supabase;
  const user = { id: auth.userId };

  // ボディの解析
  let body: CreateAgentRequest & { workspace_id: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("リクエストボディが不正です", "INVALID_JSON", 400);
  }

  // バリデーション
  if (!body.name || body.name.trim().length === 0) {
    return errorResponse("エージェント名は必須です", "VALIDATION_ERROR", 422);
  }
  if (body.name.length > 100) {
    return errorResponse("エージェント名は100文字以内にしてください", "VALIDATION_ERROR", 422);
  }
  if (!body.system_prompt || body.system_prompt.trim().length === 0) {
    return errorResponse("システムプロンプトは必須です", "VALIDATION_ERROR", 422);
  }
  if (body.system_prompt.length > 20000) {
    return errorResponse("システムプロンプトは20,000文字以内にしてください", "VALIDATION_ERROR", 422);
  }
  if (!body.workspace_id) {
    return errorResponse("workspace_idは必須です", "VALIDATION_ERROR", 422);
  }

  // APIキーがシステムプロンプトに含まれていないかチェック
  const apiKeyPattern = /sk-ant-api|sk-[a-zA-Z0-9]{48}/;
  if (apiKeyPattern.test(body.system_prompt)) {
    return errorResponse(
      "システムプロンプトにAPIキーを含めることは禁止されています",
      "SECURITY_VIOLATION",
      422
    );
  }

  // エージェントの作成
  const { data: agent, error: insertError } = await supabase
    .from("agents")
    .insert({
      workspace_id: body.workspace_id,
      created_by: user.id,
      name: body.name.trim(),
      description: body.description ?? null,
      system_prompt: body.system_prompt,
      model: body.model ?? "claude-sonnet-4-6",
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? 4096,
      visibility: body.visibility ?? "private",
      tags: body.tags ?? [],
    })
    .select()
    .single();

  if (insertError) {
    console.error("[POST /api/agents] DB error:", insertError);
    return errorResponse("エージェントの作成に失敗しました", "DB_ERROR", 500);
  }

  // バージョン1を記録
  await supabase.from("agent_versions").insert({
    agent_id: agent.id,
    version: 1,
    system_prompt: agent.system_prompt,
    model: agent.model,
    temperature: agent.temperature,
    max_tokens: agent.max_tokens,
    change_note: "初回作成",
    created_by: user.id,
  });

  return NextResponse.json({ agent }, { status: 201 });
}
