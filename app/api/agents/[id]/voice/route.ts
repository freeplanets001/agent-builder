/**
 * Voice API — テキスト入力 → エージェント実行 → TTS音声変換
 * POST /api/agents/[id]/voice
 *
 * Request body:
 *   input: string          — ユーザー入力テキスト（STTの結果）
 *   conversation_id?: string — 会話の継続
 *   tts_provider?: "google" | "openai" — TTSプロバイダー
 *   tts_voice?: string     — 音声ID
 *   language?: string      — 言語コード（デフォルト: ja-JP）
 *
 * Response:
 *   output: string         — AI応答テキスト
 *   audio_base64: string   — Base64エンコードされた音声データ
 *   mime_type: string      — 音声のMIMEタイプ
 *   conversation_id: string
 *   latency_ms: number
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { getAIProvider, estimateCost } from "@/lib/ai-client";
import { getRagContext } from "@/lib/rag-context";
import { synthesizeSpeech } from "@/lib/voice/tts";
import type { TTSProvider } from "@/lib/voice/tts";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { decryptApiKey } from "@/lib/crypto";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

interface VoiceRequestBody {
  input: string;
  conversation_id?: string;
  tts_provider?: TTSProvider;
  tts_voice?: string;
  language?: string;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: agentId } = await params;
  const startedAt = Date.now();

  // 認証
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase || !auth.userId) {
    return NextResponse.json<ApiError>(
      { error: auth.error ?? "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  const supabase = auth.supabase;

  // ボディ解析
  let body: VoiceRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: "リクエストボディが不正です", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  if (!body.input?.trim()) {
    return NextResponse.json<ApiError>(
      { error: "入力テキストは必須です", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  // エージェント取得
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json<ApiError>(
      { error: "エージェントが見つかりません", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const workspaceId = auth.workspaceId ?? agent.workspace_id;

  // 音声設定の解決（リクエスト > エージェント設定 > デフォルト）
  const voiceConfig = (agent.voice_config as { tts_provider?: string; tts_voice?: string; language?: string } | null) ?? {};
  const ttsProvider: TTSProvider = body.tts_provider ?? (voiceConfig.tts_provider as TTSProvider) ?? "google";
  const ttsVoice = body.tts_voice ?? voiceConfig.tts_voice ?? (ttsProvider === "google" ? "ja-JP-Neural2-B" : "alloy");
  const language = body.language ?? voiceConfig.language ?? "ja-JP";

  try {
    // AIプロバイダーの初期化
    const provider = await getAIProvider(agent.model, workspaceId);

    // RAGコンテキスト注入
    let systemPrompt = agent.system_prompt;
    try {
      const ragContext = await getRagContext(agentId, body.input, workspaceId);
      if (ragContext) systemPrompt += "\n\n" + ragContext;
    } catch { /* RAG失敗時は続行 */ }

    // 会話の取得/作成
    let conversationId = body.conversation_id;
    if (!conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .insert({
          agent_id: agentId,
          user_id: auth.userId,
          last_message_preview: body.input.slice(0, 100),
        })
        .select("id")
        .single();
      conversationId = conv?.id;
    }

    // エージェント実行
    const result = await provider.chat({
      model: agent.model,
      maxTokens: agent.max_tokens,
      systemPrompt,
      temperature: agent.temperature,
      messages: [{ role: "user", content: body.input }],
    });

    // TTS用のAPIキー取得
    const ttsApiKey = await resolveTTSApiKey(workspaceId, ttsProvider);
    if (!ttsApiKey) {
      return NextResponse.json<ApiError>(
        { error: `${ttsProvider === "google" ? "Google" : "OpenAI"} APIキーが未登録です`, code: "NO_TTS_API_KEY" },
        { status: 400 }
      );
    }

    // テキスト→音声変換
    const ttsResult = await synthesizeSpeech({
      text: result.output,
      provider: ttsProvider,
      apiKey: ttsApiKey,
      voice: ttsVoice,
      language,
    });

    const costUsd = estimateCost(agent.model, result.inputTokens, result.outputTokens);
    const latencyMs = Date.now() - startedAt;

    // 実行ログ保存
    await supabase.from("execution_logs").insert({
      agent_id: agentId,
      conversation_id: conversationId ?? null,
      workspace_id: workspaceId,
      user_id: auth.userId,
      status: "success",
      input: body.input,
      output: result.output,
      model: agent.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: costUsd,
      latency_ms: latencyMs,
      ended_at: new Date().toISOString(),
    });

    // メッセージ保存
    if (conversationId) {
      await supabase.from("messages").insert([
        { conversation_id: conversationId, role: "user" as const, content: body.input },
        { conversation_id: conversationId, role: "assistant" as const, content: result.output, input_tokens: result.inputTokens, output_tokens: result.outputTokens },
      ]);
    }

    // 音声セッション記録
    await supabase.from("voice_sessions").insert({
      agent_id: agentId,
      conversation_id: conversationId ?? null,
      workspace_id: workspaceId,
      user_id: auth.userId,
      tts_provider: ttsProvider,
      tts_voice: ttsVoice,
      language,
    });

    return NextResponse.json({
      output: result.output,
      audio_base64: ttsResult.audioBase64,
      mime_type: ttsResult.mimeType,
      conversation_id: conversationId,
      latency_ms: latencyMs,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: costUsd,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Voice処理に失敗しました";
    return NextResponse.json<ApiError>(
      { error: errorMessage, code: "VOICE_ERROR" },
      { status: 500 }
    );
  }
}

/** TTSプロバイダーのAPIキーを解決する */
async function resolveTTSApiKey(workspaceId: string, provider: TTSProvider): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    // OpenAI TTSはOpenAI APIキー、Google TTSはGoogle APIキーを使う
    const providerName = provider === "openai" ? "openai" : "google";
    const { data } = await supabase
      .from("provider_api_keys")
      .select("encrypted_key, iv, auth_tag, is_active")
      .eq("workspace_id", workspaceId)
      .eq("provider", providerName)
      .single();

    if (data?.is_active) {
      return decryptApiKey({ encrypted: data.encrypted_key, iv: data.iv, authTag: data.auth_tag });
    }
  } catch { /* silent */ }
  return null;
}
