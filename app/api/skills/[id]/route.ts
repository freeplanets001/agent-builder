/**
 * 個別スキル API
 * GET    /api/skills/[id]
 * PATCH  /api/skills/[id]
 * DELETE /api/skills/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  const supabase = auth.supabase;

  const { data, error } = await supabase.from("skills").select("*").eq("id", id).single();
  if (error || !data) return errorResponse("スキルが見つかりません", "NOT_FOUND", 404);

  // 実行履歴も返す
  const { data: executions } = await supabase
    .from("skill_executions")
    .select("*")
    .eq("skill_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ skill: data, executions: executions ?? [] });
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  const supabase = auth.supabase;

  const body = await request.json() as Record<string, unknown>;
  const allowed = [
    "name", "description", "skill_type", "trigger_keywords", "intent_description",
    "system_prompt", "model", "temperature", "max_tokens", "input_template",
    "workflow_steps", "agent_id", "tags", "is_active",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("更新するフィールドがありません", "VALIDATION_ERROR", 422);
  }

  const { data, error } = await supabase.from("skills").update(updates).eq("id", id).select().single();
  if (error) return errorResponse("更新に失敗しました", "DB_ERROR", 500);

  return NextResponse.json({ skill: data });
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  const supabase = auth.supabase;

  const { error } = await supabase.from("skills").delete().eq("id", id);
  if (error) return errorResponse("削除に失敗しました", "DB_ERROR", 500);

  return NextResponse.json({ message: "削除しました" });
}
