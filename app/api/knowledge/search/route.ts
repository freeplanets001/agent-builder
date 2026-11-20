/**
 * ナレッジベース検索 API
 * POST /api/knowledge/search
 *
 * クエリテキストをEmbeddingに変換し、ベクトル類似度検索を実行する。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { generateEmbedding, vectorToString } from "@/lib/embedding";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { decryptApiKey } from "@/lib/crypto";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

/** 検索結果の型 */
interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  document_id: string;
  document_title: string;
  chunk_index: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const body = await request.json() as {
    query?: string;
    knowledge_base_id?: string;
    /** 複数KBを横断検索する場合 */
    knowledge_base_ids?: string[];
    /** エージェントIDに紐づくKBを検索 */
    agent_id?: string;
    match_count?: number;
    match_threshold?: number;
  };

  if (!body.query?.trim()) {
    return errorResponse("query は必須です", "VALIDATION_ERROR", 422);
  }

  // 検索対象のKB IDsを解決
  const kbIds: string[] = [];
  if (body.knowledge_base_id) {
    kbIds.push(body.knowledge_base_id);
  }
  if (body.knowledge_base_ids?.length) {
    kbIds.push(...body.knowledge_base_ids);
  }
  if (body.agent_id) {
    // エージェントに紐づくKBを取得
    const { data: kbs } = await auth.supabase
      .from("knowledge_bases")
      .select("id")
      .or(`agent_id.eq.${body.agent_id},agent_id.is.null`)
      .eq("status", "active");
    if (kbs) {
      kbIds.push(...kbs.map((kb) => kb.id));
    }
  }

  if (kbIds.length === 0) {
    return errorResponse(
      "knowledge_base_id, knowledge_base_ids, または agent_id のいずれかが必要です",
      "VALIDATION_ERROR",
      422
    );
  }

  // ワークスペースIDを取得
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

  // クエリのEmbedding生成
  const apiKey = await resolveGoogleApiKey(workspaceId);
  if (!apiKey) {
    return errorResponse("Google APIキーが設定されていません", "NO_API_KEY", 400);
  }

  const queryEmbedding = await generateEmbedding(apiKey, body.query.trim());
  const matchCount = body.match_count ?? 5;
  const matchThreshold = body.match_threshold ?? 0.3;

  // 各KBに対してベクトル検索を実行
  const adminSupabase = createServiceRoleClient();
  const allResults: SearchResult[] = [];

  for (const kbId of [...new Set(kbIds)]) {
    const { data, error } = await adminSupabase.rpc("search_knowledge", {
      p_knowledge_base_id: kbId,
      p_query_embedding: vectorToString(queryEmbedding),
      p_match_count: matchCount,
      p_match_threshold: matchThreshold,
    });

    if (!error && data) {
      allResults.push(...(data as SearchResult[]));
    }
  }

  // 全結果を類似度でソートして上位N件
  allResults.sort((a, b) => b.similarity - a.similarity);
  const topResults = allResults.slice(0, matchCount);

  return NextResponse.json({
    results: topResults,
    total: topResults.length,
    query: body.query.trim(),
    latency_ms: Date.now() - startedAt,
  });
}

async function resolveGoogleApiKey(workspaceId: string): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("provider_api_keys")
      .select("encrypted_key, iv, auth_tag, is_active")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google")
      .single();
    if (data?.is_active) {
      return decryptApiKey({ encrypted: data.encrypted_key, iv: data.iv, authTag: data.auth_tag });
    }
  } catch { /* フォールバック */ }
  return null;
}
