/**
 * 個別エージェント操作 API
 * GET    /api/agents/[id]  — エージェント詳細を返す
 * PATCH  /api/agents/[id]  — エージェントを更新する
 * DELETE /api/agents/[id]  — エージェントを削除する
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { UpdateAgentRequest, ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  const supabase = auth.supabase;

  const { data: agent, error } = await supabase
    .from("agents")
    .select(`
      *,
      agent_tools(*),
      agent_variables(*)
    `)
    .eq("id", id)
    .single();

  if (error || !agent) {
    return errorResponse("エージェントが見つかりません", "NOT_FOUND", 404);
  }

  return NextResponse.json({ agent });
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase || !auth.userId) return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  const supabase = auth.supabase;

  let body: UpdateAgentRequest & { change_note?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("リクエストボディが不正です", "INVALID_JSON", 400);
  }

  // バリデーション
  if (body.name !== undefined && body.name.length > 100) {
    return errorResponse("エージェント名は100文字以内にしてください", "VALIDATION_ERROR", 422);
  }
  if (body.system_prompt !== undefined && body.system_prompt.length > 20000) {
    return errorResponse("システムプロンプトは20,000文字以内にしてください", "VALIDATION_ERROR", 422);
  }
  if (body.system_prompt) {
    const apiKeyPattern = /sk-ant-api|sk-[a-zA-Z0-9]{48}/;
    if (apiKeyPattern.test(body.system_prompt)) {
      return errorResponse(
        "システムプロンプトにAPIキーを含めることは禁止されています",
        "SECURITY_VIOLATION",
        422
      );
    }
  }

  // 現在のバージョンを取得
  const { data: currentAgent } = await supabase
    .from("agents")
    .select("version, system_prompt, model, temperature, max_tokens")
    .eq("id", id)
    .single();

  // 更新
  const { change_note, ...updateData } = body;
  const { data: agent, error: updateError } = await supabase
    .from("agents")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError || !agent) {
    console.error("[PATCH /api/agents/[id]] DB error:", updateError);
    return errorResponse("エージェントの更新に失敗しました", "DB_ERROR", 500);
  }

  // システムプロンプトやモデルが変更された場合はバージョンを記録
  if (
    currentAgent &&
    (body.system_prompt || body.model || body.temperature !== undefined || body.max_tokens)
  ) {
    await supabase.from("agent_versions").insert({
      agent_id: id,
      version: (currentAgent.version ?? 0) + 1,
      system_prompt: agent.system_prompt,
      model: agent.model,
      temperature: agent.temperature,
      max_tokens: agent.max_tokens,
      change_note: change_note ?? null,
      created_by: auth.userId,
    });

    await supabase
      .from("agents")
      .update({ version: (currentAgent.version ?? 0) + 1 })
      .eq("id", id);
  }

  return NextResponse.json({ agent });
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);

  const { error: deleteError } = await auth.supabase
    .from("agents")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[DELETE /api/agents/[id]] DB error:", deleteError);
    return errorResponse("エージェントの削除に失敗しました", "DB_ERROR", 500);
  }

  return NextResponse.json({ success: true });
}
