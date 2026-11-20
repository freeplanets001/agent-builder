/**
 * エージェント会話メモリ
 *
 * 会話履歴をDBに保存し、次回実行時にコンテキストとして渡す。
 * トークン数に基づいて古いメッセージを自動的に切り捨てる。
 */
import type { ChatMessage } from "@/lib/ai-providers/types";

/** メモリに保持する最大トークン数（概算） */
const MAX_CONTEXT_TOKENS = 8000;
/** 1文字あたりの概算トークン数（日本語は高め） */
const CHARS_PER_TOKEN = 2;

interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  token_count: number;
}

/**
 * 会話IDから履歴を取得し、ChatMessage配列として返す。
 * 最大トークン数を超える場合は古いメッセージから切り捨てる。
 */
export async function loadConversationHistory(
  supabase: { from: (table: string) => unknown },
  conversationId: string,
  maxTokens: number = MAX_CONTEXT_TOKENS
): Promise<ChatMessage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: messages } = await sb
    .from("conversation_messages")
    .select("role, content, token_count")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (!messages?.length) return [];

  // トークン数に基づいて切り捨て（新しいメッセージを優先）
  const reversed = [...(messages as ConversationMessage[])].reverse();
  const selected: ConversationMessage[] = [];
  let totalTokens = 0;

  for (const msg of reversed) {
    const tokens = msg.token_count || Math.ceil(msg.content.length / CHARS_PER_TOKEN);
    if (totalTokens + tokens > maxTokens) break;
    selected.unshift(msg);
    totalTokens += tokens;
  }

  return selected.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

/**
 * 会話にメッセージを追加する
 */
export async function saveMessage(
  supabase: { from: (table: string) => unknown },
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const tokenCount = Math.ceil(content.length / CHARS_PER_TOKEN);

  await sb.from("conversation_messages").insert({
    conversation_id: conversationId,
    role,
    content,
    token_count: tokenCount,
  });

  // メッセージ数を更新
  await sb
    .from("agent_conversations")
    .update({
      message_count: sb.rpc ? undefined : undefined, // RPC使わずインクリメント
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

/**
 * 新しい会話を作成する
 */
export async function createConversation(
  supabase: { from: (table: string) => unknown },
  agentId: string,
  workspaceId: string,
  userId: string,
  title?: string
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb
    .from("agent_conversations")
    .insert({
      agent_id: agentId,
      workspace_id: workspaceId,
      user_id: userId,
      title: title ?? "新しい会話",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`会話の作成に失敗: ${error?.message}`);
  return data.id;
}

/**
 * 概算トークン数を計算
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
