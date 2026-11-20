/**
 * TTS (Text-to-Speech) 統合ユーティリティ
 *
 * Google Cloud TTS / OpenAI TTS を統一インターフェースで使い分ける。
 * テキストが長い場合は分割して合成する。
 */

import type { TTSResponse } from "@/lib/ai-providers/types";

/** TTS プロバイダー種別 */
export type TTSProvider = "google" | "openai";

/** TTS リクエスト設定 */
export interface TTSRequest {
  text: string;
  provider: TTSProvider;
  apiKey: string;
  voice?: string;
  language?: string;
  speed?: number;
}

/** テキスト分割の上限（Google TTS = 5000バイト制限） */
const MAX_CHUNK_LENGTH = 4000;

/**
 * テキストを音声に変換する
 */
export async function synthesizeSpeech(request: TTSRequest): Promise<TTSResponse> {
  const { text, provider, apiKey, voice, language = "ja-JP", speed = 1.0 } = request;

  // テキストが長い場合は分割
  const chunks = splitTextForTTS(text, MAX_CHUNK_LENGTH);

  if (provider === "openai") {
    return synthesizeWithOpenAI(chunks, apiKey, voice ?? "alloy", speed);
  }

  return synthesizeWithGoogle(chunks, apiKey, voice ?? "ja-JP-Neural2-B", language);
}

/**
 * テキストをTTS用に適切な長さに分割する
 * 文末（。.!?）で区切り、最大長を超えないようにする
 */
function splitTextForTTS(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // 文末記号で分割点を探す
    let splitAt = -1;
    for (let i = Math.min(maxLength, remaining.length) - 1; i >= maxLength * 0.5; i--) {
      if ("。.!?！？\n".includes(remaining[i])) {
        splitAt = i + 1;
        break;
      }
    }

    // 文末が見つからなければ強制分割
    if (splitAt === -1) splitAt = maxLength;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trim();
  }

  return chunks;
}

/**
 * OpenAI TTS API (tts-1 / tts-1-hd)
 */
async function synthesizeWithOpenAI(
  chunks: string[],
  apiKey: string,
  voice: string,
  speed: number
): Promise<TTSResponse> {
  const audioBuffers: ArrayBuffer[] = [];

  for (const chunk of chunks) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: chunk,
        voice, // alloy, echo, fable, onyx, nova, shimmer
        speed,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`OpenAI TTS エラー: ${res.status} ${error}`);
    }

    audioBuffers.push(await res.arrayBuffer());
  }

  // 複数チャンクの場合は結合（簡易的にMP3バッファを連結）
  const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of audioBuffers) {
    combined.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  return {
    audioBase64: Buffer.from(combined).toString("base64"),
    mimeType: "audio/mpeg",
  };
}

/**
 * Google Cloud TTS API
 */
async function synthesizeWithGoogle(
  chunks: string[],
  apiKey: string,
  voice: string,
  language: string
): Promise<TTSResponse> {
  const audioBuffers: string[] = [];

  for (const chunk of chunks) {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: chunk },
          voice: {
            languageCode: language,
            name: voice,
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 1.0,
            pitch: 0,
          },
        }),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Google TTS エラー: ${res.status} ${error}`);
    }

    const data = await res.json() as { audioContent: string };
    audioBuffers.push(data.audioContent);
  }

  // 複数チャンクの場合はBase64を結合
  if (audioBuffers.length === 1) {
    return { audioBase64: audioBuffers[0], mimeType: "audio/mpeg" };
  }

  // 複数のBase64 MP3を結合
  const buffers = audioBuffers.map((b64) => Buffer.from(b64, "base64"));
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const combined = Buffer.alloc(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    buf.copy(combined, offset);
    offset += buf.length;
  }

  return {
    audioBase64: combined.toString("base64"),
    mimeType: "audio/mpeg",
  };
}

/** 利用可能な音声一覧 */
export const AVAILABLE_VOICES = {
  google: [
    { id: "ja-JP-Neural2-B", name: "日本語 男性 (Neural2)", language: "ja-JP" },
    { id: "ja-JP-Neural2-C", name: "日本語 女性 (Neural2)", language: "ja-JP" },
    { id: "ja-JP-Wavenet-B", name: "日本語 男性 (Wavenet)", language: "ja-JP" },
    { id: "ja-JP-Wavenet-C", name: "日本語 女性 (Wavenet)", language: "ja-JP" },
    { id: "en-US-Neural2-A", name: "English Male (Neural2)", language: "en-US" },
    { id: "en-US-Neural2-C", name: "English Female (Neural2)", language: "en-US" },
  ],
  openai: [
    { id: "alloy", name: "Alloy (中性的)", language: "multi" },
    { id: "echo", name: "Echo (男性)", language: "multi" },
    { id: "fable", name: "Fable (男性)", language: "multi" },
    { id: "onyx", name: "Onyx (男性, 低音)", language: "multi" },
    { id: "nova", name: "Nova (女性)", language: "multi" },
    { id: "shimmer", name: "Shimmer (女性)", language: "multi" },
  ],
} as const;
