/**
 * ドキュメント詳細 API
 * GET    /api/knowledge/[id]/documents/[docId] — ドキュメント詳細 + チャンク一覧
 * PUT    /api/knowledge/[id]/documents/[docId] — 原文編集 → 再チャンク → 再Embedding
 * DELETE /api/knowledge/[id]/documents/[docId] — ドキュメント削除
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { chunkText } from "@/lib/chunker";
import { generateEmbeddings, vectorToString } from "@/lib/embedding";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { decryptApiKey } from "@/lib/crypto";
import crypto from "crypto";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id: kbId, docId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  // ドキュメント情報を取得
  const { data: doc, error: docErr } = await auth.supabase
    .from("knowledge_documents")
    .select("id, title, source_type, original_content, chunk_count, token_count, status, error_message, metadata, created_at")
    .eq("id", docId)
    .eq("knowledge_base_id", kbId)
    .single();

  if (docErr || !doc) return errorResponse("ドキュメントが見つかりません", "NOT_FOUND", 404);

  // チャンク一覧を取得（embeddingは除外、データが大きいため）
  const { data: chunks, error: chunkErr } = await auth.supabase
    .from("knowledge_chunks")
    .select("id, content, chunk_index, token_count, metadata, created_at")
    .eq("document_id", docId)
    .order("chunk_index", { ascending: true });

  if (chunkErr) return errorResponse(chunkErr.message, "DB_ERROR", 500);

  return NextResponse.json({
    document: doc,
    chunks: chunks ?? [],
  });
}

// ============================================================
// PUT — 原文編集 → 旧チャンク削除 → 再チャンク → 再Embedding
// ============================================================
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id: kbId, docId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;
  const body = await request.json() as {
    title?: string;
    content?: string;
    source_type?: "text" | "markdown" | "csv";
  };

  if (!body.content?.trim()) {
    return errorResponse("content は必須です", "VALIDATION_ERROR", 422);
  }

  // ドキュメント存在確認
  const { data: doc, error: docErr } = await supabase
    .from("knowledge_documents")
    .select("id, title, source_type")
    .eq("id", docId)
    .eq("knowledge_base_id", kbId)
    .single();

  if (docErr || !doc) return errorResponse("ドキュメントが見つかりません", "NOT_FOUND", 404);

  // KB情報
  const { data: kb } = await supabase
    .from("knowledge_bases")
    .select("workspace_id, chunk_size, chunk_overlap")
    .eq("id", kbId)
    .single();

  if (!kb) return errorResponse("ナレッジベースが見つかりません", "NOT_FOUND", 404);

  const content = body.content.trim();
  const sourceType = body.source_type ?? (doc.source_type as "text" | "markdown" | "csv") ?? "text";
  const title = body.title?.trim() ?? doc.title;
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");

  // ステータスを processing に
  await supabase
    .from("knowledge_documents")
    .update({ status: "processing" })
    .eq("id", docId);

  try {
    // 旧チャンクを削除
    const adminSupabase = createServiceRoleClient();
    await adminSupabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", docId);

    // 再チャンク
    const chunks = chunkText(content, sourceType, {
      chunkSize: kb.chunk_size ?? 512,
      overlap: kb.chunk_overlap ?? 64,
    });

    if (chunks.length === 0) throw new Error("チャンク分割の結果が空です");

    // Google APIキー取得 → 再Embedding
    const apiKey = await resolveGoogleApiKey(kb.workspace_id);
    if (!apiKey) throw new Error("Google APIキーが設定されていません");

    const embeddings = await generateEmbeddings(apiKey, chunks.map((c) => c.content));

    // 新チャンクを保存
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: docId,
      knowledge_base_id: kbId,
      content: chunk.content,
      embedding: vectorToString(embeddings[i]),
      chunk_index: chunk.index,
      token_count: chunk.tokenEstimate,
    }));

    const { error: chunkErr } = await adminSupabase
      .from("knowledge_chunks")
      .insert(chunkRows);

    if (chunkErr) throw new Error(`チャンク保存失敗: ${chunkErr.message}`);

    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenEstimate, 0);

    // ドキュメントを更新
    await supabase
      .from("knowledge_documents")
      .update({
        title,
        original_content: content,
        content_hash: contentHash,
        source_type: sourceType,
        status: "ready",
        chunk_count: chunks.length,
        token_count: totalTokens,
      })
      .eq("id", docId);

    return NextResponse.json({
      document: { id: docId, title, status: "ready", chunk_count: chunks.length, token_count: totalTokens },
      message: `更新完了: ${chunks.length}チャンクを再生成しました`,
    });
  } catch (err) {
    await supabase
      .from("knowledge_documents")
      .update({ status: "error", error_message: err instanceof Error ? err.message : "不明なエラー" })
      .eq("id", docId);

    return errorResponse(err instanceof Error ? err.message : "更新に失敗しました", "PROCESSING_ERROR", 500);
  }
}

/** Google APIキーを解決する */
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

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id: kbId, docId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  // チャンクも CASCADE で削除される
  const { error } = await auth.supabase
    .from("knowledge_documents")
    .delete()
    .eq("id", docId)
    .eq("knowledge_base_id", kbId);

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  // ナレッジベースの集計値を更新
  const adminSupabase = createServiceRoleClient();
  const { count: docCount } = await adminSupabase
    .from("knowledge_documents")
    .select("id", { count: "exact", head: true })
    .eq("knowledge_base_id", kbId)
    .eq("status", "ready");

  const { count: chunkCount } = await adminSupabase
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .eq("knowledge_base_id", kbId);

  await adminSupabase
    .from("knowledge_bases")
    .update({
      document_count: docCount ?? 0,
      chunk_count: chunkCount ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", kbId);

  return NextResponse.json({ message: "ドキュメントを削除しました" });
}
