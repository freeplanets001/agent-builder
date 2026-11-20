/**
 * AIプロバイダー共通インターフェース
 *
 * 全プロバイダー（Anthropic, Google, OpenAI）がこの型に準拠する。
 */

/** プロバイダー識別子 */
export type ProviderId = "anthropic" | "google" | "openai";

/** 画像添付データ */
export interface ImageAttachment {
  /** Base64エンコードされた画像データ */
  base64: string;
  /** MIMEタイプ (例: image/png, image/jpeg) */
  mimeType: string;
}

/** チャットメッセージ */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** 画像添付（マルチモーダル対応） */
  images?: ImageAttachment[];
}

/** チャットリクエスト */
export interface ChatRequest {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}

/** チャットレスポンス */
export interface ChatResponse {
  output: string;
  inputTokens: number;
  outputTokens: number;
}

/** 画像生成リクエスト */
export interface ImageGenerateRequest {
  prompt: string;
  aspectRatio?: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";
  imageSize?: "1K" | "2K" | "4K";
}

/** 画像生成レスポンス */
export interface ImageGenerateResponse {
  /** Base64エンコードされた画像データ */
  imageBase64: string;
  /** MIMEタイプ (例: image/png) */
  mimeType: string;
  /** AIが返したテキスト（あれば） */
  text: string;
}

/** ツール定義（AI APIに渡す形式） */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** AIがツール呼び出しを要求した場合のレスポンス */
export interface ToolCallRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** ツール呼び出し対応のチャットレスポンス */
export interface ChatWithToolsResponse extends ChatResponse {
  /** AIの最終テキスト出力（ツール実行完了後） */
  output: string;
  /** ツール呼び出し履歴 */
  toolCalls: Array<{ name: string; input: Record<string, unknown>; output: string }>;
}

/** ストリーミングイベント */
export interface StreamDelta {
  type: "text_delta" | "done" | "error";
  text?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** ストリーミングコールバック */
export type OnStreamDelta = (delta: StreamDelta) => void;

/** TTS リクエストオプション */
export interface TTSOptions {
  voice: string;
  language: string;
  speed?: number;
}

/** TTS レスポンス */
export interface TTSResponse {
  audioBase64: string;
  mimeType: string;
  durationMs?: number;
}

/** AIプロバイダーアダプター */
export interface AIProvider {
  readonly providerId: ProviderId;

  /** 同期チャット */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /** ストリーミングチャット */
  chatStream(request: ChatRequest, onDelta: OnStreamDelta): Promise<ChatResponse>;

  /** 接続テスト（APIキーの有効性チェック） */
  testConnection(): Promise<{ ok: boolean; error?: string }>;

  /** テキスト→音声変換（対応プロバイダーのみ） */
  textToSpeech?(text: string, options: TTSOptions): Promise<TTSResponse>;
}

/** モデル → プロバイダーのマッピング */
export function getProviderForModel(model: string): ProviderId {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("gpt-")) return "openai";
  // デフォルトはAnthropic
  return "anthropic";
}

/** モデル別コスト（USD per 1M tokens） */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-6":            { input: 15,   output: 75 },
  "claude-sonnet-4-6":          { input: 3,    output: 15 },
  "claude-haiku-4-5":           { input: 0.8,  output: 4 },
  "claude-opus-4-5":            { input: 15,   output: 75 },
  "claude-sonnet-4-5":          { input: 3,    output: 15 },
  "claude-3-5-sonnet-20241022": { input: 3,    output: 15 },
  "claude-3-5-haiku-20241022":  { input: 0.8,  output: 4 },
  // Google
  "gemini-2.5-pro":             { input: 1.25, output: 10 },
  "gemini-2.5-flash":           { input: 0.15, output: 0.6 },
  // OpenAI
  "gpt-4o":                     { input: 2.5,  output: 10 },
  "gpt-4o-mini":                { input: 0.15, output: 0.6 },
};

/** 画像生成モデルの1枚あたりコスト (USD) */
export const IMAGE_MODEL_COSTS: Record<string, Record<string, number>> = {
  "gemini-2.0-flash-preview-image-generation": { "1K": 0.039, "2K": 0.039, "4K": 0.079 },
};

/** コスト計算 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_COSTS[model] ?? { input: 3, output: 15 };
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}
