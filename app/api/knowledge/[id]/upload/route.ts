/**
 * ファイルアップロード API
 * POST /api/knowledge/[id]/upload
 *
 * multipart/form-data でファイルを受け取り、
 * テキスト抽出 → チャンク分割 → Embedding生成 → DB保存
 *
 * 対応形式: .txt, .md, .csv, .pdf
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

/** 最大ファイルサイズ: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 対応するMIMEタイプ */
const SUPPORTED_TYPES: Record<string, "text" | "markdown" | "csv" | "pdf"> = {
  "text/plain": "text",
  "text/markdown": "markdown",
  "text/csv": "csv",
  "application/pdf": "pdf",
  // 拡張子ベースのフォールバック
  "application/octet-stream": "text",
};

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

/** ファイル拡張子からソースタイプを判定 */
function detectSourceType(filename: string, mimeType: string): "text" | "markdown" | "csv" | "pdf" {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
    case "markdown":
      return "markdown";
    case "csv":
      return "csv";
    case "pdf":
      return "pdf";
    case "txt":
      return "text";
    default:
      return SUPPORTED_TYPES[mimeType] ?? "text";
  }
}

/** PDFからテキストを抽出 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return data.text;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: kbId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;

  // multipart/form-data の解析
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return errorResponse("file フィールドは必須です", "VALIDATION_ERROR", 422);
  }

  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(
      `ファイルサイズが上限（${MAX_FILE_SIZE / 1024 / 1024}MB）を超えています`,
      "FILE_TOO_LARGE",
      413
    );
  }

  const sourceType = detectSourceType(file.name, file.type);
  const title = (formData.get("title") as string) || file.name;

  // ナレッジベース情報を取得
  const { data: kb, error: kbErr } = await supabase
    .from("knowledge_bases")
    .select("workspace_id, chunk_size, chunk_overlap")
    .eq("id", kbId)
    .single();

  if (kbErr || !kb) return errorResponse("ナレッジベースが見つかりません", "NOT_FOUND", 404);

  // ファイルからテキストを抽出
  let textContent: string;
  try {
    if (sourceType === "pdf") {
      const buffer = Buffer.from(await file.arrayBuffer());
      textContent = await extractPdfText(buffer);
    } else {
      textContent = await file.text();
    }
  } catch (err) {
    return errorResponse(
      `ファイルの読み取りに失敗: ${err instanceof Error ? err.message : "不明なエラー"}`,
      "FILE_READ_ERROR",
      400
    );
  }

  if (!textContent.trim()) {
    return errorResponse("ファイルの内容が空です", "EMPTY_CONTENT", 422);
  }

  const contentHash = crypto.createHash("sha256").update(textContent).digest("hex");

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
      title,
      source_type: sourceType,
      original_content: textContent,
      content_hash: contentHash,
      status: "processing",
      metadata: {
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size,
      },
    })
    .select()
    .single();

  if (docErr || !doc) {
    return errorResponse(`ドキュメント作成失敗: ${docErr?.message}`, "DB_ERROR", 500);
  }

  try {
    // チャンク分割
    const chunks = chunkText(textContent, sourceType === "pdf" ? "text" : sourceType, {
      chunkSize: kb.chunk_size ?? 512,
      overlap: kb.chunk_overlap ?? 64,
    });

    if (chunks.length === 0) {
      throw new Error("チャンク分割の結果が空です");
    }

    // Google APIキーを取得
    const apiKey = await resolveGoogleApiKey(kb.workspace_id);
    if (!apiKey) {
      throw new Error("Google APIキーが設定されていません");
    }

    // Embedding生成
    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(apiKey, texts);

    // チャンクをDBに保存
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

    // メタデータ更新
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenEstimate, 0);

    await supabase
      .from("knowledge_documents")
      .update({ status: "ready", chunk_count: chunks.length, token_count: totalTokens })
      .eq("id", doc.id);

    // ナレッジベースの集計値を更新
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

    return NextResponse.json({
      document: {
        id: doc.id,
        title,
        source_type: sourceType,
        status: "ready",
        chunk_count: chunks.length,
        token_count: totalTokens,
        file_size: file.size,
      },
      message: `${file.name} から ${chunks.length}チャンクを生成しました`,
    }, { status: 201 });
  } catch (err) {
    await supabase
      .from("knowledge_documents")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message : "不明なエラー",
      })
      .eq("id", doc.id);

    return errorResponse(
      err instanceof Error ? err.message : "ファイルの処理に失敗しました",
      "PROCESSING_ERROR",
      500
    );
  }
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
