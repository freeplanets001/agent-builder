/**
 * テキストチャンク分割ユーティリティ
 *
 * ドキュメントを意味のある単位に分割する。
 * Embedding + ベクトル検索の精度はチャンク品質に大きく依存する。
 */

/** チャンク分割の設定 */
export interface ChunkOptions {
  /** 1チャンクの最大文字数 */
  chunkSize: number;
  /** チャンク間のオーバーラップ文字数 */
  overlap: number;
}

/** 分割されたチャンク */
export interface Chunk {
  content: string;
  index: number;
  tokenEstimate: number;
}

/** デフォルト設定 */
const DEFAULT_OPTIONS: ChunkOptions = {
  chunkSize: 512,
  overlap: 64,
};

/** 概算トークン数（日本語は1文字≒1.5トークン、英語は1単語≒1.3トークン） */
function estimateTokens(text: string): number {
  // 日本語文字数カウント
  const japaneseChars = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) ?? []).length;
  const otherChars = text.length - japaneseChars;
  return Math.ceil(japaneseChars * 1.5 + otherChars * 0.4);
}

/**
 * Markdownテキストをセクション単位で分割する
 * 見出し(#)を区切りとして使い、長いセクションはさらに段落で分割
 */
export function chunkMarkdown(text: string, options: Partial<ChunkOptions> = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 見出しで分割
  const sections = text.split(/(?=^#{1,3}\s)/m).filter((s) => s.trim());

  const chunks: Chunk[] = [];
  let buffer = "";

  for (const section of sections) {
    if (buffer.length + section.length <= opts.chunkSize) {
      buffer += (buffer ? "\n\n" : "") + section;
    } else {
      // バッファをフラッシュ
      if (buffer) {
        chunks.push({
          content: buffer.trim(),
          index: chunks.length,
          tokenEstimate: estimateTokens(buffer),
        });
      }

      // セクションがチャンクサイズを超える場合、段落で分割
      if (section.length > opts.chunkSize) {
        const subChunks = chunkByParagraphs(section, opts);
        for (const sc of subChunks) {
          chunks.push({ ...sc, index: chunks.length });
        }
        buffer = "";
      } else {
        buffer = section;
      }
    }
  }

  // 残りをフラッシュ
  if (buffer.trim()) {
    chunks.push({
      content: buffer.trim(),
      index: chunks.length,
      tokenEstimate: estimateTokens(buffer),
    });
  }

  return chunks;
}

/**
 * プレーンテキストを段落単位で分割する
 */
function chunkByParagraphs(text: string, opts: ChunkOptions): Chunk[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  const chunks: Chunk[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    if (buffer.length + para.length <= opts.chunkSize) {
      buffer += (buffer ? "\n\n" : "") + para;
    } else {
      if (buffer) {
        chunks.push({
          content: buffer.trim(),
          index: chunks.length,
          tokenEstimate: estimateTokens(buffer),
        });
      }

      // 段落が長すぎる場合は文単位で分割
      if (para.length > opts.chunkSize) {
        const sentenceChunks = chunkBySentences(para, opts);
        chunks.push(...sentenceChunks.map((sc, i) => ({ ...sc, index: chunks.length + i })));
        buffer = "";
      } else {
        buffer = para;
      }
    }
  }

  if (buffer.trim()) {
    chunks.push({
      content: buffer.trim(),
      index: chunks.length,
      tokenEstimate: estimateTokens(buffer),
    });
  }

  return chunks;
}

/**
 * テキストを文単位で分割する（フォールバック）
 */
function chunkBySentences(text: string, opts: ChunkOptions): Chunk[] {
  // 日本語と英語の句点で分割
  const sentences = text.split(/(?<=[。！？.!?\n])\s*/).filter((s) => s.trim());
  const chunks: Chunk[] = [];
  let buffer = "";

  for (const sent of sentences) {
    if (buffer.length + sent.length <= opts.chunkSize) {
      buffer += sent;
    } else {
      if (buffer) {
        chunks.push({
          content: buffer.trim(),
          index: chunks.length,
          tokenEstimate: estimateTokens(buffer),
        });
      }
      // 文がチャンクサイズを超える場合は強制分割
      if (sent.length > opts.chunkSize) {
        for (let i = 0; i < sent.length; i += opts.chunkSize - opts.overlap) {
          const slice = sent.slice(i, i + opts.chunkSize);
          chunks.push({
            content: slice,
            index: chunks.length,
            tokenEstimate: estimateTokens(slice),
          });
        }
        buffer = "";
      } else {
        buffer = sent;
      }
    }
  }

  if (buffer.trim()) {
    chunks.push({
      content: buffer.trim(),
      index: chunks.length,
      tokenEstimate: estimateTokens(buffer),
    });
  }

  return chunks;
}

/**
 * CSVテキストを行グループ単位で分割する
 * ヘッダー行を各チャンクに含めて検索精度を上げる
 */
export function chunkCsv(text: string, options: Partial<ChunkOptions> = {}): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = text.split("\n");
  if (lines.length < 2) {
    return [{ content: text, index: 0, tokenEstimate: estimateTokens(text) }];
  }

  const header = lines[0];
  const dataLines = lines.slice(1).filter((l) => l.trim());
  const chunks: Chunk[] = [];
  let buffer = header;

  for (const line of dataLines) {
    if (buffer.length + line.length + 1 <= opts.chunkSize) {
      buffer += "\n" + line;
    } else {
      chunks.push({
        content: buffer,
        index: chunks.length,
        tokenEstimate: estimateTokens(buffer),
      });
      buffer = header + "\n" + line; // ヘッダーを再付与
    }
  }

  if (buffer.trim() && buffer !== header) {
    chunks.push({
      content: buffer,
      index: chunks.length,
      tokenEstimate: estimateTokens(buffer),
    });
  }

  return chunks;
}

/**
 * テキストタイプに基づいて適切なチャンク分割を行う
 */
export function chunkText(
  text: string,
  sourceType: "text" | "markdown" | "csv" = "text",
  options: Partial<ChunkOptions> = {}
): Chunk[] {
  switch (sourceType) {
    case "markdown":
      return chunkMarkdown(text, options);
    case "csv":
      return chunkCsv(text, options);
    default:
      return chunkMarkdown(text, options); // プレーンテキストもMarkdownロジックで対応
  }
}
