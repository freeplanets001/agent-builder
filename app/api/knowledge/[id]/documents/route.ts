/**
 * ドキュメントアップロード API
 * GET  /api/knowledge/[id]/documents — ドキュメント一覧
 * POST /api/knowledge/[id]/documents — テキストアップロード → チャンク分割 → Embedding生成 → 保存
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { chunkText } from "@/lib/chunker";
import { generateEmbeddings, vectorToString } from "@/lib/embedding";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { decryptApiKey } from "@/lib/crypto";
import crypto from "crypto";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

// ============================================================
// GET — ドキュメント一覧
// ============================================================
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id: kbId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { data, error } = await auth.supabase
    .from("knowledge_documents")
    .select("id, title, source_type, chunk_count, token_count, status, error_message, created_at")
    .eq("knowledge_base_id", kbId)
    .order("created_at", { ascending: false });

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  return NextResponse.json({ documents: data ?? [] });
}

// ============================================================
// POST — ドキュメントアップロード + Embedding生成
// ============================================================
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id: kbId } = await params;
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
  if (!body.title?.trim()) {
    return errorResponse("title は必須です", "VALIDATION_ERROR", 422);
  }

  const content = body.content.trim();
  const sourceType = body.source_type ?? "text";
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");

  // ナレッジベース情報を取得
  const { data: kb, error: kbErr } = await supabase
    .from("knowledge_bases")
    .select("workspace_id, chunk_size, chunk_overlap")
    .eq("id", kbId)
    .single();

  if (kbErr || !kb) return errorResponse("ナレッジベースが見つかりません", "NOT_FOUND", 404);

  // 重複チェック
  const { data: existing } = await supabase
    .from("knowledge_documents")
    .select("id")
    .eq("knowledge_base_id", kbId)
    .eq("content_hash", contentHash)
    .single();

  if (existing) {
    return errorResponse("同じ内容のドキュメントが既に登録されています", "DUPLICATE", 409);
  }

  // ドキュメント作成（processing状態）
  const { data: doc, error: docErr } = await supabase
    .from("knowledge_documents")
    .insert({
      knowledge_base_id: kbId,
      title: body.title.trim(),
      source_type: sourceType,
      original_content: content,
      content_hash: contentHash,
      status: "processing",
    })
    .select()
    .single();

  if (docErr || !doc) return errorResponse(`ドキュメント作成失敗: ${docErr?.message}`, "DB_ERROR", 500);

  try {
    // チャンク分割
    const chunks = chunkText(content, sourceType, {
      chunkSize: kb.chunk_size ?? 512,
      overlap: kb.chunk_overlap ?? 64,
    });

    if (chunks.length === 0) {
      throw new Error("チャンク分割の結果が空です");
    }

    // Google APIキーを取得してEmbedding生成
    const apiKey = await resolveGoogleApiKey(kb.workspace_id);
    if (!apiKey) {
      throw new Error("Google APIキーが設定されていません。Embeddingの生成にはGoogle APIキーが必要です。");
    }

    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(apiKey, texts);

    // チャンクをDBに保存（サービスロールで直接挿入、RLSバイパス）
    const adminSupabase = createServiceRoleClient();
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: doc.id,
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

    // ドキュメントとナレッジベースのメタデータ更新
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenEstimate, 0);

    await supabase
      .from("knowledge_documents")
      .update({
        status: "ready",
        chunk_count: chunks.length,
        token_count: totalTokens,
      })
      .eq("id", doc.id);

    // ナレッジベースの集計を更新（RPCがない場合は手動）
    try {
      await adminSupabase.rpc("update_kb_stats", { kb_id: kbId });
    } catch {
      await adminSupabase
        .from("knowledge_bases")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", kbId);
    }

    return NextResponse.json({
      document: {
        id: doc.id,
        title: doc.title,
        status: "ready",
        chunk_count: chunks.length,
        token_count: totalTokens,
      },
      message: `${chunks.length}チャンクのEmbeddingを生成しました`,
    }, { status: 201 });

  } catch (err) {
    // エラー時はドキュメントのステータスを更新
    await supabase
      .from("knowledge_documents")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : "不明なエラー",
      })
      .eq("id", doc.id);

    return errorResponse(
      err instanceof Error ? err.message : "ドキュメントの処理に失敗しました",
      "PROCESSING_ERROR",
      500
    );
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
