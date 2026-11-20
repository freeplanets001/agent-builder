/**
 * ナレッジベース詳細 API
 * GET    /api/knowledge/[id] — 詳細取得
 * PATCH  /api/knowledge/[id] — 更新（agent_id紐づけ等）
 * DELETE /api/knowledge/[id] — 削除
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
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { data, error } = await auth.supabase
    .from("knowledge_bases")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return errorResponse("ナレッジベースが見つかりません", "NOT_FOUND", 404);

  return NextResponse.json({ knowledge_base: data });
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const body = await request.json() as {
    name?: string;
    description?: string;
    agent_id?: string | null;
    status?: string;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.agent_id !== undefined) updates.agent_id = body.agent_id;
  if (body.status !== undefined) updates.status = body.status;

  const { data, error } = await auth.supabase
    .from("knowledge_bases")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  return NextResponse.json({ knowledge_base: data });
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { error } = await auth.supabase
    .from("knowledge_bases")
    .delete()
    .eq("id", id);

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  return NextResponse.json({ message: "削除しました" });
}
