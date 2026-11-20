/**
 * 個別自動化ルール API
 * GET    /api/automations/[id] — 詳細取得
 * PATCH  /api/automations/[id] — 更新
 * DELETE /api/automations/[id] — 削除
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse("認証が必要です", "UNAUTHORIZED", 401);

  const { data, error } = await supabase
    .from("automations")
    .select("*, agents(name), webhook_tokens(token)")
    .eq("id", id)
    .single();

  if (error || !data) return errorResponse("自動化が見つかりません", "NOT_FOUND", 404);

  // 実行履歴も取得
  const { data: runs } = await supabase
    .from("automation_runs")
    .select("*")
    .eq("automation_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ automation: data, runs: runs ?? [] });
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse("認証が必要です", "UNAUTHORIZED", 401);

  const body = await request.json() as Record<string, unknown>;

  // 更新可能フィールドのみ抽出
  const allowedFields = ["name", "description", "trigger_config", "agent_id", "input_template", "is_active", "next_run_at"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("更新するフィールドがありません", "VALIDATION_ERROR", 422);
  }

  const { data, error } = await supabase
    .from("automations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[PATCH /api/automations] DBエラー:", error);
    return errorResponse("更新に失敗しました", "DB_ERROR", 500);
  }

  return NextResponse.json({ automation: data });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse("認証が必要です", "UNAUTHORIZED", 401);

  const { error } = await supabase.from("automations").delete().eq("id", id);
  if (error) return errorResponse("削除に失敗しました", "DB_ERROR", 500);

  return NextResponse.json({ message: "削除しました" });
}
