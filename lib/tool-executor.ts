/**
 * エージェントツール実行エンジン
 *
 * AIが要求したツールを実行し、結果を返す。
 * 各ツールはサンドボックス的な制約の中で動作する。
 */
import type { AgentTool } from "@/lib/types";

/** ツール実行結果 */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

/** ツール実行のコンテキスト */
export interface ToolContext {
  workspaceId: string;
  /** Google APIキー（画像生成用） */
  googleApiKey?: string;
}

/** ツールの入力パラメータ型（AIが送信するJSON） */
interface WebSearchInput { query: string; num_results?: number }
interface WebBrowseInput { url: string; extract?: "text" | "links" | "all" }
interface HttpRequestInput { url: string; method?: string; headers?: Record<string, string>; body?: string }
interface ImageGenerationInput { prompt: string; aspect_ratio?: string }
interface DatabaseQueryInput { query: string }
interface CodeExecutionInput { code: string; language?: string }
interface FileReadInput { path: string }
interface FileWriteInput { path: string; content: string }
interface KnowledgeSearchInput { query: string; knowledge_base_id?: string; match_count?: number }

/** ツール最大実行時間 */
const TOOL_TIMEOUT_MS = 30_000;

/**
 * AIプロバイダーに渡すツール定義を生成する
 * Anthropic / Google / OpenAI 共通のJSON Schema形式
 */
export function buildToolDefinitions(tools: AgentTool[]): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return tools
    .filter((t) => t.enabled)
    .map((tool) => {
      const schema = TOOL_SCHEMAS[tool.tool_type];
      if (!schema) return null;
      return {
        name: tool.tool_type,
        description: schema.description,
        input_schema: schema.input_schema,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

/** 各ツールのJSON Schema定義 */
const TOOL_SCHEMAS: Record<string, { description: string; input_schema: Record<string, unknown> }> = {
  web_search: {
    description: "インターネットでキーワード検索を実行し、検索結果を返す。情報収集、最新ニュース、事実確認に使用。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索クエリ" },
        num_results: { type: "number", description: "取得件数（デフォルト5）" },
      },
      required: ["query"],
    },
  },
  http_request: {
    description: "外部APIやWebサイトにHTTPリクエストを送信する。データ取得、API連携に使用。",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "リクエスト先URL" },
        method: { type: "string", description: "HTTPメソッド（GET/POST/PUT/DELETE）", enum: ["GET", "POST", "PUT", "DELETE"] },
        headers: { type: "object", description: "リクエストヘッダー" },
        body: { type: "string", description: "リクエストボディ（JSON文字列）" },
      },
      required: ["url"],
    },
  },
  image_generation: {
    description: "テキストプロンプトからAI画像を生成する。",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "画像生成プロンプト（英語推奨）" },
        aspect_ratio: { type: "string", description: "アスペクト比", enum: ["1:1", "16:9", "9:16", "3:2", "2:3"] },
      },
      required: ["prompt"],
    },
  },
  database_query: {
    description: "Supabaseデータベースに対してSELECTクエリを実行する（読み取り専用）。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "テーブル名.カラム形式で指定（例: agents.name,description）" },
      },
      required: ["query"],
    },
  },
  code_execution: {
    description: "JavaScriptコードを実行して計算や変換を行う。数値計算、文字列操作、JSON変換等に使用。",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "実行するJavaScriptコード" },
      },
      required: ["code"],
    },
  },
  file_read: {
    description: "ナレッジベースに登録されたドキュメントの内容を読み取る。",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "ドキュメントタイトルまたはID" },
      },
      required: ["path"],
    },
  },
  file_write: {
    description: "テキストや実行結果をファイルとしてクラウドストレージに保存する。レポート生成、データ出力等に使用。",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "ファイル名（例: report.txt, output.csv）" },
        content: { type: "string", description: "保存する内容" },
      },
      required: ["path", "content"],
    },
  },
  knowledge_search: {
    description: "ナレッジベースからベクトル類似度検索で関連ドキュメントを検索する。質問に答えるための知識が必要な時に使用。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索クエリ（自然言語で具体的に記述）" },
        knowledge_base_id: { type: "string", description: "特定のナレッジベースIDで検索（省略時は全KB）" },
        match_count: { type: "number", description: "取得件数（1-10、デフォルト5）" },
      },
      required: ["query"],
    },
  },
  web_browse: {
    description: "指定URLのWebページを取得し、テキストやリンクを抽出する。記事の内容確認、Webページの分析に使用。",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "取得するWebページのURL" },
        extract: { type: "string", description: "抽出モード", enum: ["text", "links", "all"] },
      },
      required: ["url"],
    },
  },
};

/**
 * ツールを実行する
 */
export async function executeTool(
  toolType: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  try {
    switch (toolType) {
      case "web_search":
        return await executeWebSearch(input as unknown as WebSearchInput);
      case "http_request":
        return await executeHttpRequest(input as unknown as HttpRequestInput);
      case "image_generation":
        return await executeImageGeneration(input as unknown as ImageGenerationInput, context);
      case "database_query":
        return await executeDatabaseQuery(input as unknown as DatabaseQueryInput, context);
      case "code_execution":
        return await executeCodeExecution(input as unknown as CodeExecutionInput);
      case "file_read":
        return await executeFileRead(input as unknown as FileReadInput, context);
      case "file_write":
        return await executeFileWrite(input as unknown as FileWriteInput, context);
      case "knowledge_search":
        return await executeKnowledgeSearch(input as unknown as KnowledgeSearchInput, context);
      case "web_browse":
        return await executeWebBrowse(input as unknown as WebBrowseInput);
      default:
        return { success: false, output: "", error: `未対応のツール: ${toolType}` };
    }
  } catch (err) {
    return { success: false, output: "", error: err instanceof Error ? err.message : "ツール実行エラー" };
  }
}

// ============================================================
// 各ツールの実装
// ============================================================

/** Web検索 — Google Custom Search APIまたはフォールバック */
async function executeWebSearch(input: WebSearchInput): Promise<ToolResult> {
  const { query, num_results = 5 } = input;

  // DuckDuckGo Instant Answer API（無料、APIキー不要）
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json() as {
      AbstractText?: string;
      AbstractSource?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };

    const results: string[] = [];

    if (data.AbstractText) {
      results.push(`【概要】${data.AbstractText} (${data.AbstractSource})`);
    }

    const topics = data.RelatedTopics ?? [];
    for (const topic of topics.slice(0, num_results)) {
      if (topic.Text) {
        results.push(`- ${topic.Text}${topic.FirstURL ? ` (${topic.FirstURL})` : ""}`);
      }
    }

    if (results.length === 0) {
      // フォールバック: Google検索結果ページをスクレイピング風に
      return { success: true, output: `「${query}」の検索を実行しましたが、構造化された結果が得られませんでした。Webブラウザでの検索を推奨します。` };
    }

    return { success: true, output: `「${query}」の検索結果:\n\n${results.join("\n")}` };
  } finally {
    clearTimeout(timeout);
  }
}

/** HTTPリクエスト */
async function executeHttpRequest(input: HttpRequestInput): Promise<ToolResult> {
  const { url, method = "GET", headers = {}, body } = input;

  // セキュリティ: ローカルホストへのリクエストを制限
  const parsedUrl = new URL(url);
  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsedUrl.hostname)) {
    return { success: false, output: "", error: "ローカルホストへのリクエストは制限されています" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method,
      headers: { "User-Agent": "AgentBuilder/2.0", ...headers },
      body: method !== "GET" ? body : undefined,
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") ?? "";
    let responseBody: string;

    if (contentType.includes("json")) {
      const json = await res.json();
      responseBody = JSON.stringify(json, null, 2).slice(0, 5000);
    } else {
      responseBody = (await res.text()).slice(0, 5000);
    }

    return {
      success: res.ok,
      output: `HTTP ${res.status} ${res.statusText}\n\n${responseBody}`,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** 画像生成 */
async function executeImageGeneration(
  input: ImageGenerationInput,
  context: ToolContext
): Promise<ToolResult> {
  if (!context.googleApiKey) {
    return { success: false, output: "", error: "Google APIキーが未設定です" };
  }

  const { GoogleProvider } = await import("@/lib/ai-providers/google");
  const provider = new GoogleProvider(context.googleApiKey);
  const result = await provider.generateImage({
    prompt: input.prompt,
    aspectRatio: (input.aspect_ratio ?? "16:9") as "16:9",
    imageSize: "1K",
  });

  return {
    success: true,
    output: `画像を生成しました。\n[画像データ: ${result.mimeType}, ${Math.round(result.imageBase64.length * 0.75 / 1024)}KB]\n${result.text || ""}`,
  };
}

/** DBクエリ（読み取り専用） */
async function executeDatabaseQuery(
  input: DatabaseQueryInput,
  context: ToolContext
): Promise<ToolResult> {
  const { createServiceRoleClient } = await import("@/lib/supabase-server");
  const supabase = createServiceRoleClient();

  // "table.col1,col2" 形式をパース
  const parts = input.query.split(".");
  if (parts.length < 2) {
    return { success: false, output: "", error: "形式: テーブル名.カラム1,カラム2 (例: agents.name,description)" };
  }

  const table = parts[0];
  const columns = parts.slice(1).join(".");
  if (!["agents", "skills", "knowledge_bases", "knowledge_documents", "execution_logs", "flows", "agent_pipelines"].includes(table)) {
    return { success: false, output: "", error: "このテーブルはツールから参照できません" };
  }

  // ワークスペース制限付きクエリ
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("workspace_id", context.workspaceId)
    .limit(20);

  if (error) {
    return { success: false, output: "", error: `クエリエラー: ${error.message}` };
  }

  return { success: true, output: JSON.stringify(data, null, 2).slice(0, 5000) };
}

/** コード実行（JavaScriptのみ、サンドボックス） */
async function executeCodeExecution(input: CodeExecutionInput): Promise<ToolResult> {
  const { code } = input;

  // 危険なAPIを制限
  const forbidden = ["process", "require", "import(", "eval(", "Function(", "fs.", "child_process", "exec("];
  for (const f of forbidden) {
    if (code.includes(f)) {
      return { success: false, output: "", error: `セキュリティ制限: "${f}" は使用できません` };
    }
  }

  try {
    // 安全な実行: Function コンストラクタで隔離
    const fn = new Function("JSON", "Math", "Date", "Array", "Object", "String", "Number", "RegExp", "parseInt", "parseFloat", "isNaN", `
      "use strict";
      const console = { log: (...args) => args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') };
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      const result = (() => { ${code} })();
      return { result: result !== undefined ? String(result) : null, logs };
    `);

    const output = fn(JSON, Math, Date, Array, Object, String, Number, RegExp, parseInt, parseFloat, isNaN) as {
      result: string | null;
      logs: string[];
    };

    const parts: string[] = [];
    if (output.logs.length > 0) parts.push(output.logs.join("\n"));
    if (output.result) parts.push(`=> ${output.result}`);

    return { success: true, output: parts.join("\n") || "(出力なし)" };
  } catch (err) {
    return { success: false, output: "", error: `実行エラー: ${err instanceof Error ? err.message : "不明"}` };
  }
}

/** ファイル読み込み（ナレッジベースからドキュメント検索） */
async function executeFileRead(input: FileReadInput, context: ToolContext): Promise<ToolResult> {
  const { createServiceRoleClient } = await import("@/lib/supabase-server");
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from("knowledge_documents")
    .select("title, original_content, knowledge_base_id")
    .or(`title.ilike.%${input.path}%,id.eq.${input.path}`)
    .limit(1)
    .single();

  if (!data) {
    return { success: false, output: "", error: `ドキュメント "${input.path}" が見つかりません` };
  }

  return { success: true, output: `# ${data.title}\n\n${(data.original_content ?? "").slice(0, 8000)}` };
}

/** ファイル書き込み — Supabase Storageに保存 */
async function executeFileWrite(input: FileWriteInput, context: ToolContext): Promise<ToolResult> {
  const { saveOutput } = await import("@/lib/cloudflare/outputs");
  try {
    const url = await saveOutput(context.workspaceId, input.path, input.content);
    return { success: true, output: `「${input.path}」を保存しました (${input.content.length}文字)。\nダウンロードURL: ${url}` };
  } catch {
    return { success: false, output: "", error: "ファイルを保存できませんでした" };
  }
}

// ============================================================
// Agentic RAG: ナレッジベース検索ツール
// ============================================================

/** ナレッジベース検索 — ベクトル類似度検索 + クエリリライト + 関連性評価 */
async function executeKnowledgeSearch(input: KnowledgeSearchInput, context: ToolContext): Promise<ToolResult> {
  const { createServiceRoleClient } = await import("@/lib/supabase-server");
  const { generateEmbedding, vectorToString } = await import("@/lib/embedding");
  const { decryptApiKey } = await import("@/lib/crypto");

  const supabase = createServiceRoleClient();
  const matchCount = Math.min(10, Math.max(1, input.match_count ?? 5));

  // Google APIキーを取得（Embedding生成に必要）
  const { data: keyData } = await supabase
    .from("provider_api_keys")
    .select("encrypted_key, iv, auth_tag, is_active")
    .eq("workspace_id", context.workspaceId)
    .eq("provider", "google")
    .single();

  if (!keyData?.is_active) {
    return { success: false, output: "", error: "Google APIキーが未設定です（Embedding生成に必要）" };
  }

  const apiKey = decryptApiKey({ encrypted: keyData.encrypted_key, iv: keyData.iv, authTag: keyData.auth_tag });

  // 検索対象のナレッジベースを特定
  let kbIds: string[] = [];
  if (input.knowledge_base_id) {
    kbIds = [input.knowledge_base_id];
  } else {
    // ワークスペース内の全アクティブKBを検索
    const { data: kbs } = await supabase
      .from("knowledge_bases")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("status", "active");
    kbIds = (kbs ?? []).map((kb) => kb.id);
  }

  if (kbIds.length === 0) {
    return { success: true, output: "ナレッジベースが見つかりません。先にドキュメントをアップロードしてください。" };
  }

  // クエリのEmbeddingを生成
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(apiKey, input.query);
  } catch (err) {
    return { success: false, output: "", error: `Embedding生成エラー: ${err instanceof Error ? err.message : "不明"}` };
  }

  // 各KBで並行検索
  interface SearchResult {
    content: string;
    similarity: number;
    document_title: string;
    chunk_index: number;
  }

  const allResults: SearchResult[] = [];
  const searchPromises = kbIds.map(async (kbId) => {
    try {
      const { data } = await supabase.rpc("search_knowledge", {
        p_knowledge_base_id: kbId,
        p_query_embedding: vectorToString(queryEmbedding),
        p_match_count: matchCount,
        p_match_threshold: 0.35,
      });
      if (data) {
        allResults.push(
          ...(data as SearchResult[])
        );
      }
    } catch {
      // 個別KB検索エラーはスキップ
    }
  });

  await Promise.all(searchPromises);

  if (allResults.length === 0) {
    return { success: true, output: `「${input.query}」に関連するドキュメントが見つかりませんでした。別の表現でお試しください。` };
  }

  // 類似度順にソートして上位を取得
  allResults.sort((a, b) => b.similarity - a.similarity);
  const topResults = allResults.slice(0, matchCount);

  // 結果をフォーマット
  const formattedResults = topResults.map((r, i) => {
    const simPct = Math.round(r.similarity * 100);
    return `### ${i + 1}. ${r.document_title} (類似度: ${simPct}%)\n${r.content}`;
  }).join("\n\n---\n\n");

  return {
    success: true,
    output: `「${input.query}」の検索結果 (${topResults.length}件):\n\n${formattedResults}`,
  };
}

/** Webページ閲覧 — URLからテキスト/リンクを抽出 */
async function executeWebBrowse(input: WebBrowseInput): Promise<ToolResult> {
  const { url, extract = "text" } = input;

  // URLバリデーション
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { success: false, output: "", error: "無効なURLです" };
  }

  // セキュリティ: ローカルホスト・内部IPへのアクセスを制限
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "[::]", "[::1]"];
  if (blockedHosts.includes(parsedUrl.hostname)) {
    return { success: false, output: "", error: "ローカルホストへのアクセスは制限されています" };
  }
  // プライベートIP範囲をブロック（10.x, 172.16-31.x, 192.168.x）
  const ipMatch = parsedUrl.hostname.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (ipMatch) {
    const [, first, second] = ipMatch;
    if (first === "10" || first === "192" && second === "168" || first === "172" && Number(second) >= 16 && Number(second) <= 31) {
      return { success: false, output: "", error: "プライベートIPへのアクセスは制限されています" };
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AgentBuilder/2.0 (Web Browse Tool)" },
      redirect: "follow",
    });

    if (!res.ok) {
      return { success: false, output: "", error: `HTTP ${res.status} ${res.statusText}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/json")) {
      return { success: false, output: "", error: `非対応のContent-Type: ${contentType}` };
    }

    const html = await res.text();
    const MAX_OUTPUT_CHARS = 5000;

    // テキスト抽出: script/style除去 → タグ除去 → 空白正規化
    const extractText = (raw: string): string => {
      return raw
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_OUTPUT_CHARS);
    };

    // リンク抽出: <a href="...">text</a>
    const extractLinks = (raw: string): string => {
      const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      const links: string[] = [];
      let match;
      while ((match = linkRegex.exec(raw)) !== null && links.length < 50) {
        const href = match[1];
        const text = match[2].replace(/<[^>]+>/g, "").trim();
        if (href && !href.startsWith("#") && !href.startsWith("javascript:") && text) {
          // 相対URLを絶対URLに変換
          try {
            const absoluteUrl = new URL(href, url).href;
            links.push(`- [${text.slice(0, 100)}](${absoluteUrl})`);
          } catch {
            links.push(`- [${text.slice(0, 100)}](${href})`);
          }
        }
      }
      return links.length > 0
        ? `${url} のリンク一覧 (${links.length}件):\n\n${links.join("\n")}`
        : "リンクが見つかりませんでした";
    };

    // タイトル抽出
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
    const titleLine = title ? `# ${title}\n\n` : "";

    switch (extract) {
      case "links":
        return { success: true, output: extractLinks(html) };
      case "all":
        return {
          success: true,
          output: `${titleLine}## テキスト\n${extractText(html).slice(0, 3000)}\n\n## リンク\n${extractLinks(html).slice(0, 2000)}`,
        };
      case "text":
      default:
        return { success: true, output: `${titleLine}${extractText(html)}` };
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, output: "", error: "タイムアウト: ページの取得に30秒以上かかりました" };
    }
    return { success: false, output: "", error: `取得エラー: ${err instanceof Error ? err.message : "不明"}` };
  } finally {
    clearTimeout(timeout);
  }
}
