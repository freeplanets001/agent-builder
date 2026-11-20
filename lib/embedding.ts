/**
 * Embedding ユーティリティ
 *
 * Gemini text-embedding-004 でテキストをベクトル化する。
 * 768次元のベクトルを返す。
 */
import { GoogleGenAI } from "@google/genai";

/** Embeddingモデル */
const EMBEDDING_MODEL = "gemini-embedding-001";
/** ベクトル次元数 */
const EMBEDDING_DIMENSIONS = 768;
/** バッチサイズ上限 */
const MAX_BATCH_SIZE = 100;

/**
 * テキストをEmbeddingベクトルに変換する
 */
export async function generateEmbedding(
  apiKey: string,
  text: string
): Promise<number[]> {
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });

  const embedding = response.embeddings?.[0]?.values;
  if (!embedding?.length) {
    throw new Error("Embeddingの生成に失敗しました");
  }

  return embedding;
}

/**
 * 複数テキストを一括でEmbeddingに変換する
 * Gemini APIはバッチ対応しているのでまとめて送信
 */
export async function generateEmbeddings(
  apiKey: string,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = new GoogleGenAI({ apiKey });
  const results: number[][] = [];

  // バッチに分割して処理
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });

    for (const emb of response.embeddings ?? []) {
      if (emb.values) {
        results.push(emb.values);
      } else {
        // フォールバック: ゼロベクトル
        results.push(new Array(EMBEDDING_DIMENSIONS).fill(0));
      }
    }
  }

  return results;
}

/**
 * ベクトルをSupabaseのpgvector形式の文字列に変換
 * [1.0, 2.0, 3.0] → "[1.0,2.0,3.0]"
 */
export function vectorToString(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/** エクスポート用定数 */
export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
