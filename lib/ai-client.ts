/**
 * AIクライアント — プロバイダー振り分けレイヤー
 *
 * モデル名からプロバイダーを判定し、適切なSDKで実行する。
 * APIキーはDBから取得する（ユーザーが設定画面で登録したもの）。
 * 環境変数へのフォールバックは行わない（開発者のコスト負担を防ぐ）。
 */
import { createServiceRoleClient } from "@/lib/supabase-server";
import { decryptApiKey } from "@/lib/crypto";
import {
  getProviderForModel,
  estimateCost as _estimateCost,
  type AIProvider,
  type ProviderId,
  type ChatRequest,
  type ChatResponse,
  type OnStreamDelta,
} from "@/lib/ai-providers/types";
import { AnthropicProvider } from "@/lib/ai-providers/anthropic";
import { GoogleProvider } from "@/lib/ai-providers/google";
import { OpenAIProvider } from "@/lib/ai-providers/openai";

// re-export
export { estimateCost } from "@/lib/ai-providers/types";
export type { ChatRequest, ChatResponse, OnStreamDelta, ProviderId } from "@/lib/ai-providers/types";

/** プロバイダー表示名 */
const PROVIDER_NAMES: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  google: "Google AI",
  openai: "OpenAI",
};

/**
 * ワークスペースのDBに保存されたAPIキーを取得
 */
async function getApiKeyFromDB(
  workspaceId: string,
  provider: ProviderId
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("provider_api_keys")
    .select("encrypted_key, iv, auth_tag, is_active")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .single();

  if (error || !data || !data.is_active) return null;

  return decryptApiKey({
    encrypted: data.encrypted_key,
    iv: data.iv,
    authTag: data.auth_tag,
  });
}

/**
 * APIキーを解決する（DBのみ）
 *
 * ユーザーが設定画面で登録したAPIキーのみ使用する。
 * 環境変数へのフォールバックは行わない（開発者のコスト負担を防ぐ）。
 */
async function resolveApiKey(
  workspaceId: string | null,
  provider: ProviderId
): Promise<string> {
  if (!workspaceId) {
    throw new Error(`${PROVIDER_NAMES[provider]} のAPIキーが取得できません。ワークスペースが不明です。`);
  }

  const dbKey = await getApiKeyFromDB(workspaceId, provider);
  if (dbKey) return dbKey;

  throw new Error(
    `${PROVIDER_NAMES[provider]} のAPIキーが未登録です。「設定」画面からAPIキーを登録してください。`
  );
}

/**
 * プロバイダーインスタンスを生成
 */
function createProvider(provider: ProviderId, apiKey: string): AIProvider {
  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(apiKey);
    case "google":
      return new GoogleProvider(apiKey);
    case "openai":
      return new OpenAIProvider(apiKey);
  }
}

/**
 * ワークスペースで利用可能なプロバイダーのモデルを解決する
 *
 * 優先プロバイダー順に APIキーが登録済みか確認し、
 * 最初に見つかったプロバイダーの指定ティアのモデルを返す。
 *
 * 用途: プロンプト生成やオーケストレーターなど、
 *       特定プロバイダーに依存すべきでない内部処理
 */
export async function resolveAvailableModel(
  workspaceId: string | null,
  tier: "fast" | "smart" = "smart"
): Promise<string> {
  // ティアごとのモデル候補（安い順にフォールバック）
  const MODEL_MAP: Record<"fast" | "smart", Array<{ provider: ProviderId; model: string }>> = {
    fast: [
      { provider: "google",    model: "gemini-2.5-flash" },
      { provider: "anthropic", model: "claude-haiku-4-5" },
      { provider: "openai",    model: "gpt-4o-mini" },
    ],
    smart: [
      { provider: "google",    model: "gemini-2.5-pro" },
      { provider: "anthropic", model: "claude-sonnet-4-6" },
      { provider: "openai",    model: "gpt-4o" },
    ],
  };

  if (!workspaceId) {
    throw new Error("ワークスペースが不明なため、AIモデルを解決できません。");
  }

  const candidates = MODEL_MAP[tier];
  for (const candidate of candidates) {
    const key = await getApiKeyFromDB(workspaceId, candidate.provider);
    if (key) return candidate.model;
  }

  throw new Error(
    "利用可能なAIプロバイダーが見つかりません。「設定」画面からいずれかのAPIキーを登録してください。"
  );
}

/**
 * モデル名とワークスペースIDからAIプロバイダーを取得
 *
 * 使い方:
 * ```ts
 * const provider = await getAIProvider("gemini-2.5-flash", workspaceId);
 * const result = await provider.chat({ ... });
 * ```
 */
export async function getAIProvider(
  model: string,
  workspaceId: string | null = null
): Promise<AIProvider> {
  const providerId = getProviderForModel(model);
  const apiKey = await resolveApiKey(workspaceId, providerId);
  return createProvider(providerId, apiKey);
}

/**
 * 簡易チャット関数 — モデル名を渡すだけで実行
 */
export async function chat(
  model: string,
  systemPrompt: string,
  userMessage: string,
  options: {
    workspaceId?: string | null;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<ChatResponse & { costUsd: number }> {
  const provider = await getAIProvider(model, options.workspaceId ?? null);
  const response = await provider.chat({
    model,
    systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    temperature: options.temperature ?? 0.7,
    maxTokens: options.maxTokens ?? 4096,
  });

  return {
    ...response,
    costUsd: _estimateCost(model, response.inputTokens, response.outputTokens),
  };
}

/**
 * 接続テスト — 指定プロバイダーのAPIキーが有効か確認
 */
export async function testProviderConnection(
  provider: ProviderId,
  apiKey: string
): Promise<{ ok: boolean; error?: string }> {
  const instance = createProvider(provider, apiKey);
  return instance.testConnection();
}
