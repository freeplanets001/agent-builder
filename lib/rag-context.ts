/**
 * RAGコンテキスト注入
 *
 * エージェント実行時に、紐づくナレッジベースから
 * 関連ドキュメントを検索し、システムプロンプトに注入する。
 */
import { createServiceRoleClient } from "@/lib/supabase-server";
import { decryptApiKey } from "@/lib/crypto";
import { generateEmbedding, vectorToString } from "@/lib/embedding";

/** RAGコンテキストの最大文字数 */
const MAX_CONTEXT_CHARS = 4000;
/** 検索結果の最大件数 */
const MAX_RESULTS = 5;
/** 類似度の最低閾値 */
const MIN_SIMILARITY = 0.35;

interface RagChunk {
  content: string;
  similarity: number;
  document_title: string;
}

/**
 * エージェントに紐づくナレッジベースからRAGコンテキストを取得する
 *
 * @returns 注入するコンテキスト文字列。KBがなければ空文字列
 */
export async function getRagContext(
  agentId: string,
  userInput: string,
  workspaceId: string
): Promise<string> {
  const adminSupabase = createServiceRoleClient();

  // エージェントに紐づくKBを検索（エージェント専用 + ワークスペース共有）
  const { data: kbs } = await adminSupabase
    .from("knowledge_bases")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .or(`agent_id.eq.${agentId},agent_id.is.null`);

  if (!kbs?.length) return "";

  // Google APIキーを取得
  const apiKey = await resolveGoogleApiKey(workspaceId);
  if (!apiKey) return "";

  // ユーザー入力のEmbeddingを生成
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(apiKey, userInput);
  } catch {
    return ""; // Embedding生成失敗時はRAGなしで続行
  }

  // 各KBで検索
  const allChunks: RagChunk[] = [];
  for (const kb of kbs) {
    try {
      const { data } = await adminSupabase.rpc("search_knowledge", {
        p_knowledge_base_id: kb.id,
        p_query_embedding: vectorToString(queryEmbedding),
        p_match_count: MAX_RESULTS,
        p_match_threshold: MIN_SIMILARITY,
      });
      if (data) {
        allChunks.push(
          ...(data as Array<{ content: string; similarity: number; document_title: string }>)
        );
      }
    } catch {
      // 個別KB検索エラーはスキップ
    }
  }

  if (allChunks.length === 0) return "";

  // 類似度順にソートして上位を取得
  allChunks.sort((a, b) => b.similarity - a.similarity);

  // 最大文字数内でコンテキストを構築
  const contextParts: string[] = [];
  let totalChars = 0;

  for (const chunk of allChunks) {
    if (totalChars + chunk.content.length > MAX_CONTEXT_CHARS) break;
    contextParts.push(
      `[${chunk.document_title}] (類似度: ${(chunk.similarity * 100).toFixed(0)}%)\n${chunk.content}`
    );
    totalChars += chunk.content.length;
  }

  if (contextParts.length === 0) return "";

  return [
    "--- 参考情報（ナレッジベースより） ---",
    ...contextParts,
    "--- 参考情報ここまで ---",
    "",
    "上記の参考情報を踏まえて回答してください。参考情報に含まれない内容は、その旨を明記してください。",
  ].join("\n\n");
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
