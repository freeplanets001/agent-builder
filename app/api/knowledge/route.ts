/**
 * ナレッジベース API
 * GET  /api/knowledge — 一覧取得
 * POST /api/knowledge — 作成
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent_id");

  let query = auth.supabase
    .from("knowledge_bases")
    .select("*, knowledge_documents(count), knowledge_chunks(count)")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (agentId) {
    query = query.or(`agent_id.eq.${agentId},agent_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  // 集計結果をフラットなフィールドに変換
  const enriched = (data ?? []).map((kb) => {
    const docCount = (kb.knowledge_documents as Array<{ count: number }>)?.[0]?.count ?? kb.document_count ?? 0;
    const chunkCount = (kb.knowledge_chunks as Array<{ count: number }>)?.[0]?.count ?? kb.chunk_count ?? 0;
    const { knowledge_documents, knowledge_chunks, ...rest } = kb;
    void knowledge_documents;
    void knowledge_chunks;
    return { ...rest, document_count: docCount, chunk_count: chunkCount };
  });

  return NextResponse.json({ knowledge_bases: enriched, total: enriched.length });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const body = await request.json() as {
    name?: string;
    description?: string;
    agent_id?: string;
    chunk_size?: number;
    chunk_overlap?: number;
  };

  if (!body.name?.trim()) {
    return errorResponse("name は必須です", "VALIDATION_ERROR", 422);
  }

  let workspaceId = auth.workspaceId;
  if (!workspaceId) {
    const { data: member } = await auth.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", auth.userId!)
      .limit(1)
      .single();
    workspaceId = member?.workspace_id ?? null;
  }
  if (!workspaceId) return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);

  const { data, error } = await auth.supabase
    .from("knowledge_bases")
    .insert({
      workspace_id: workspaceId,
      name: body.name.trim(),
      description: body.description ?? "",
      agent_id: body.agent_id ?? null,
      chunk_size: body.chunk_size ?? 512,
      chunk_overlap: body.chunk_overlap ?? 64,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  return NextResponse.json({ knowledge_base: data }, { status: 201 });
}
