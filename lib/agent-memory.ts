/**
 * エージェント長期メモリシステム
 *
 * 会話をまたいで永続的に情報を記憶する。
 * - ベクトル検索で関連メモリを取得
 * - Haikuで会話からメモリを自動抽出
 * - プロンプトにコンテキストとして注入
 */
import { createServiceRoleClient } from "@/lib/supabase-server";
import { generateEmbedding } from "@/lib/embedding";
import { decryptApiKey } from "@/lib/crypto";

/** メモリの種類 */
export type MemoryType = "fact" | "preference" | "instruction" | "context";

/** メモリレコード */
export interface AgentMemory {
  id: string;
  agent_id: string;
  workspace_id: string;
  user_id: string;
  memory_type: MemoryType;
  content: string;
  importance: number;
  access_count: number;
  source_conversation_id: string | null;
  last_accessed_at: string;
  expires_at: string | null;
  created_at: string;
}

/** メモリ検索結果 */
interface MemorySearchResult {
  id: string;
  content: string;
  memory_type: string;
  importance: number;
  similarity: number;
  created_at: string;
}

/**
 * 関連メモリをベクトル検索で取得する
 */
export async function retrieveRelevantMemories(
  agentId: string,
  userId: string,
  query: string,
  workspaceId: string,
  maxResults: number = 5
): Promise<MemorySearchResult[]> {
  const googleApiKey = await resolveGoogleApiKey(workspaceId);
  if (!googleApiKey) return [];

  try {
    const embedding = await generateEmbedding(googleApiKey, query);
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase.rpc("search_agent_memories", {
      p_agent_id: agentId,
      p_user_id: userId,
      p_query_embedding: `[${embedding.join(",")}]`,
      p_match_count: maxResults,
      p_match_threshold: 0.3,
    });

    if (error || !data) return [];

    // アクセスカウントを更新（非同期、ブロックしない）
    const memoryIds = (data as MemorySearchResult[]).map((m) => m.id);
    if (memoryIds.length > 0) {
      supabase
        .from("agent_memories")
        .update({ last_accessed_at: new Date().toISOString() })
        .in("id", memoryIds)
        .then(() => {/* fire and forget */});
    }

    return data as MemorySearchResult[];
  } catch {
    return [];
  }
}

/**
 * メモリを保存する
 */
export async function storeMemory(
  agentId: string,
  userId: string,
  content: string,
  memoryType: MemoryType,
  workspaceId: string,
  options?: {
    importance?: number;
    conversationId?: string;
    expiresAt?: string;
  }
): Promise<AgentMemory | null> {
  const googleApiKey = await resolveGoogleApiKey(workspaceId);

  try {
    const supabase = createServiceRoleClient();

    // Embedding生成（Google APIキーがある場合のみ）
    let embeddingStr: string | null = null;
    if (googleApiKey) {
      const embedding = await generateEmbedding(googleApiKey, content);
      embeddingStr = `[${embedding.join(",")}]`;
    }

    const { data, error } = await supabase
      .from("agent_memories")
      .insert({
        agent_id: agentId,
        workspace_id: workspaceId,
        user_id: userId,
        memory_type: memoryType,
        content,
        embedding: embeddingStr,
        importance: options?.importance ?? 0.5,
        source_conversation_id: options?.conversationId ?? null,
        expires_at: options?.expiresAt ?? null,
      })
      .select("*")
      .single();

    if (error) return null;
    return data as AgentMemory;
  } catch {
    return null;
  }
}

/**
 * AIの出力から記憶すべき情報を自動抽出する
 * Haikuモデルで低コスト抽出
 */
export async function extractMemoriesFromConversation(
  agentId: string,
  userId: string,
  userInput: string,
  aiOutput: string,
  workspaceId: string,
  conversationId?: string
): Promise<void> {
  try {
    const { getAIProvider } = await import("@/lib/ai-client");

    // Haikuで低コスト抽出
    let provider;
    try {
      provider = await getAIProvider("claude-haiku-4-5", workspaceId);
    } catch {
      return; // APIキーがなければスキップ
    }

    const result = await provider.chat({
      model: "claude-haiku-4-5",
      maxTokens: 500,
      temperature: 0,
      systemPrompt: `以下の会話から、エージェントが将来の会話で活用できる情報を抽出してください。
抽出すべき情報:
- ユーザーについての事実 (fact): 名前、職業、所属、技術スタックなど
- ユーザーの好み (preference): 好きなスタイル、言語、フォーマットなど
- 明示的な指示 (instruction): 「次から〜してほしい」「〜は避けて」など

各項目を以下のJSON配列形式で返してください。何もなければ空配列 [] を返してください。
[{"type":"fact","content":"...", "importance": 0.1-1.0}, ...]

重要度ガイドライン:
- 0.1-0.3: 些細な情報（一時的な話題）
- 0.4-0.6: 中程度（仕事の内容、技術スタック）
- 0.7-0.9: 重要（明示的な指示、強い好み）
- 1.0: 極めて重要（必ず従うべき指示）`,
      messages: [{
        role: "user",
        content: `ユーザー: ${userInput.slice(0, 1000)}\n\nアシスタント: ${aiOutput.slice(0, 1000)}`,
      }],
    });

    // JSON配列を抽出
    const jsonMatch = result.output.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const memories = JSON.parse(jsonMatch[0]) as Array<{
      type: MemoryType;
      content: string;
      importance: number;
    }>;

    // 各メモリを保存（最大5件）
    for (const mem of memories.slice(0, 5)) {
      if (mem.content && mem.content.length > 5) {
        await storeMemory(agentId, userId, mem.content, mem.type, workspaceId, {
          importance: Math.min(1, Math.max(0.1, mem.importance)),
          conversationId,
        });
      }
    }
  } catch {
    // メモリ抽出失敗はサイレント（メイン処理をブロックしない）
  }
}

/**
 * メモリをプロンプト注入用テキストに変換する
 */
export function buildMemoryContext(memories: MemorySearchResult[]): string {
  if (memories.length === 0) return "";

  const typeLabels: Record<string, string> = {
    fact: "事実",
    preference: "好み",
    instruction: "指示",
    context: "コンテキスト",
  };

  const lines = memories.map((m) => {
    const label = typeLabels[m.memory_type] ?? m.memory_type;
    return `- [${label}] ${m.content} (関連度: ${Math.round(m.similarity * 100)}%)`;
  });

  return `\n\n【ユーザーに関する記憶】\n以下はこのユーザーとの過去の会話から記憶した情報です。応答に活用してください。\n${lines.join("\n")}`;
}

/** Google APIキーを解決 */
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
  } catch { /* silent */ }
  return null;
}
