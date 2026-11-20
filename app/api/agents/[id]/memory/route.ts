/**
 * Agent Memory CRUD API
 * GET    /api/agents/[id]/memory — メモリ一覧
 * POST   /api/agents/[id]/memory — メモリ追加
 * DELETE /api/agents/[id]/memory — メモリ削除
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { storeMemory } from "@/lib/agent-memory";
import type { MemoryType } from "@/lib/agent-memory";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

/** メモリ一覧取得 */
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

  const searchParams = request.nextUrl.searchParams;
  const memoryType = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  let query = auth.supabase
    .from("agent_memories")
    .select("id, agent_id, memory_type, content, importance, access_count, last_accessed_at, expires_at, created_at", { count: "exact" })
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (memoryType) {
    query = query.eq("memory_type", memoryType);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json<ApiError>(
      { error: `メモリ取得エラー: ${error.message}`, code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    memories: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}

/** メモリ追加 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: agentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase || !auth.userId) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const body = await request.json() as {
    content: string;
    memory_type?: MemoryType;
    importance?: number;
  };

  if (!body.content?.trim()) {
    return NextResponse.json<ApiError>(
      { error: "コンテンツは必須です", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  // ワークスペースID取得
  const { data: agent } = await auth.supabase
    .from("agents")
    .select("workspace_id")
    .eq("id", agentId)
    .single();

  if (!agent) {
    return NextResponse.json<ApiError>(
      { error: "エージェントが見つかりません", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const memory = await storeMemory(
    agentId,
    auth.userId,
    body.content.trim(),
    body.memory_type ?? "fact",
    agent.workspace_id,
    { importance: body.importance }
  );

  if (!memory) {
    return NextResponse.json<ApiError>(
      { error: "メモリの保存に失敗しました", code: "STORE_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ memory }, { status: 201 });
}

/** メモリ削除 */
export async function DELETE(
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

  const { memory_id } = await request.json() as { memory_id: string };
  if (!memory_id) {
    return NextResponse.json<ApiError>(
      { error: "memory_idは必須です", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  const { error } = await auth.supabase
    .from("agent_memories")
    .delete()
    .eq("id", memory_id)
    .eq("agent_id", agentId);

  if (error) {
    return NextResponse.json<ApiError>(
      { error: `削除エラー: ${error.message}`, code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true });
}
