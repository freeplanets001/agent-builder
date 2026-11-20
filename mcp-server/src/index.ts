#!/usr/bin/env node
/**
 * Agent Builder MCP Server
 *
 * Claude Code / Claude Desktop から Agent Builder のエージェントを
 * MCP (Model Context Protocol) 経由で操作するサーバー。
 *
 * 環境変数:
 *   AGENT_BUILDER_URL — Agent Builder の URL (例: http://localhost:3000)
 *   AGENT_BUILDER_KEY — API キー
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ============================================================
// 設定
// ============================================================

const BASE_URL = process.env.AGENT_BUILDER_URL ?? "http://localhost:3000";
const API_KEY = process.env.AGENT_BUILDER_KEY ?? "";

// ============================================================
// HTTP ヘルパー
// ============================================================

interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    ...(options.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    return { ok: false, status: res.status, data: { error: `Invalid JSON response: ${text.slice(0, 200)}` } as unknown as T };
  }
  return { ok: res.ok, status: res.status, data };
}

// ============================================================
// MCP サーバー
// ============================================================

const server = new McpServer({
  name: "agent-builder",
  version: "0.1.0",
});

// ----------------------------------------------------------
// Tool 1: agent_list — エージェント一覧取得
// ----------------------------------------------------------
server.tool(
  "agent_list",
  "Agent Builder に登録されたエージェントの一覧を取得する",
  {
    search: z.string().optional().describe("名前・説明で検索"),
    tag: z.string().optional().describe("タグでフィルタ"),
    limit: z.number().optional().describe("取得件数 (デフォルト: 20)"),
  },
  async ({ search, tag, limit }) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (tag) params.set("tag", tag);
    if (limit) params.set("limit", String(limit));

    const res = await apiRequest<{
      agents: Array<{
        id: string;
        name: string;
        description: string | null;
        model: string;
        tags: string[];
        is_active: boolean;
      }>;
      total: number;
    }>(`/api/agents?${params}`);

    if (!res.ok) {
      return { content: [{ type: "text" as const, text: `エラー: エージェント一覧の取得に失敗 (${res.status})` }] };
    }

    const summary = res.data.agents.map((a) =>
      `- **${a.name}** (${a.id})\n  ${a.description ?? "説明なし"} | モデル: ${a.model} | タグ: ${a.tags.join(", ") || "なし"}`
    ).join("\n");

    return {
      content: [{
        type: "text" as const,
        text: `## エージェント一覧 (${res.data.total}件)\n\n${summary || "エージェントがありません"}`,
      }],
    };
  }
);

// ----------------------------------------------------------
// Tool 2: agent_get — エージェント詳細取得
// ----------------------------------------------------------
server.tool(
  "agent_get",
  "エージェントの詳細設定（システムプロンプト、モデル、ツール等）を取得する",
  {
    agent_id: z.string().describe("エージェントID"),
  },
  async ({ agent_id }) => {
    const res = await apiRequest<{
      agent: {
        id: string;
        name: string;
        description: string | null;
        system_prompt: string;
        model: string;
        temperature: number;
        max_tokens: number;
        tags: string[];
        visibility: string;
        version: number;
        agent_tools: Array<{ tool_name: string; tool_type: string; enabled: boolean }>;
      };
    }>(`/api/agents/${agent_id}`);

    if (!res.ok) {
      return { content: [{ type: "text" as const, text: `エラー: エージェントが見つかりません (${res.status})` }] };
    }

    const a = res.data.agent;
    const tools = a.agent_tools?.length
      ? a.agent_tools.map((t) => `  - ${t.tool_name} (${t.tool_type}) ${t.enabled ? "有効" : "無効"}`).join("\n")
      : "  なし";

    return {
      content: [{
        type: "text" as const,
        text: [
          `# ${a.name}`,
          ``,
          `${a.description ?? ""}`,
          ``,
          `## 設定`,
          `- モデル: ${a.model}`,
          `- Temperature: ${a.temperature}`,
          `- 最大トークン: ${a.max_tokens}`,
          `- バージョン: v${a.version}`,
          `- 公開範囲: ${a.visibility}`,
          `- タグ: ${a.tags.join(", ") || "なし"}`,
          ``,
          `## ツール`,
          tools,
          ``,
          `## システムプロンプト`,
          "```",
          a.system_prompt,
          "```",
        ].join("\n"),
      }],
    };
  }
);

// ----------------------------------------------------------
// Tool 3: agent_run — エージェント実行
// ----------------------------------------------------------
server.tool(
  "agent_run",
  "エージェントにメッセージを送信して実行結果を取得する",
  {
    agent_id: z.string().describe("エージェントID"),
    input: z.string().describe("ユーザーの入力テキスト"),
    variables: z.record(z.string(), z.string()).optional().describe("プロンプト変数の値マップ"),
  },
  async ({ agent_id, input, variables }) => {
    const res = await apiRequest<{
      output: string;
      image_base64?: string;
      mime_type?: string;
      conversation_id: string;
      log_id: string;
      latency_ms: number;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
    }>(`/api/agents/${agent_id}/run`, {
      method: "POST",
      body: JSON.stringify({ input, variables, stream: false }),
    });

    if (!res.ok) {
      const errData = res.data as unknown as { error?: string };
      return { content: [{ type: "text" as const, text: `エラー: ${errData.error ?? "実行に失敗しました"} (${res.status})` }] };
    }

    const d = res.data;
    const contentParts: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];

    // 画像がある場合は画像を含める
    if (d.image_base64 && d.mime_type) {
      contentParts.push({
        type: "image" as const,
        data: d.image_base64,
        mimeType: d.mime_type,
      });
    }

    contentParts.push({
      type: "text" as const,
      text: [
        d.output,
        ``,
        `---`,
        `_トークン: ${d.input_tokens}入力 / ${d.output_tokens}出力 | コスト: $${d.cost_usd.toFixed(4)} | ${d.latency_ms}ms_`,
        d.image_base64 ? `_画像生成済み_` : "",
      ].filter(Boolean).join("\n"),
    });

    return { content: contentParts };
  }
);

// ----------------------------------------------------------
// Tool 4: agent_create — エージェント作成
// ----------------------------------------------------------
server.tool(
  "agent_create",
  "新しいエージェントを作成する",
  {
    name: z.string().describe("エージェント名 (100文字以内)"),
    system_prompt: z.string().describe("システムプロンプト"),
    description: z.string().optional().describe("説明"),
    model: z.string().optional().describe("モデル名 (デフォルト: claude-sonnet-4-6)"),
    temperature: z.number().optional().describe("温度 (0.0-1.0)"),
    max_tokens: z.number().optional().describe("最大トークン数"),
    tags: z.array(z.string()).optional().describe("タグ"),
    workspace_id: z.string().describe("ワークスペースID"),
  },
  async ({ name, system_prompt, description, model, temperature, max_tokens, tags, workspace_id }) => {
    const res = await apiRequest<{ agent: { id: string; name: string } }>("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        name,
        system_prompt,
        description,
        model: model ?? "claude-sonnet-4-6",
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 4096,
        tags: tags ?? [],
        workspace_id,
      }),
    });

    if (!res.ok) {
      const errData = res.data as unknown as { error?: string };
      return { content: [{ type: "text" as const, text: `エラー: ${errData.error ?? "作成に失敗しました"} (${res.status})` }] };
    }

    return {
      content: [{
        type: "text" as const,
        text: `エージェント「${res.data.agent.name}」を作成しました (ID: ${res.data.agent.id})`,
      }],
    };
  }
);

// ----------------------------------------------------------
// Tool 5: agent_update — エージェント更新
// ----------------------------------------------------------
server.tool(
  "agent_update",
  "既存のエージェントの設定を更新する",
  {
    agent_id: z.string().describe("エージェントID"),
    name: z.string().optional().describe("新しい名前"),
    system_prompt: z.string().optional().describe("新しいシステムプロンプト"),
    description: z.string().optional().describe("新しい説明"),
    model: z.string().optional().describe("新しいモデル名"),
    temperature: z.number().optional().describe("新しい温度"),
    max_tokens: z.number().optional().describe("新しい最大トークン数"),
    tags: z.array(z.string()).optional().describe("新しいタグ"),
  },
  async ({ agent_id, ...updates }) => {
    // undefined のフィールドを除外
    const body = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    const res = await apiRequest<{ agent: { id: string; name: string; version: number } }>(
      `/api/agents/${agent_id}`,
      { method: "PATCH", body: JSON.stringify(body) }
    );

    if (!res.ok) {
      const errData = res.data as unknown as { error?: string };
      return { content: [{ type: "text" as const, text: `エラー: ${errData.error ?? "更新に失敗しました"} (${res.status})` }] };
    }

    return {
      content: [{
        type: "text" as const,
        text: `エージェント「${res.data.agent.name}」を更新しました (v${res.data.agent.version})`,
      }],
    };
  }
);

// ----------------------------------------------------------
// Tool 6: agent_delete — エージェント削除
// ----------------------------------------------------------
server.tool(
  "agent_delete",
  "エージェントを削除する（この操作は取り消せません）",
  {
    agent_id: z.string().describe("削除するエージェントのID"),
  },
  async ({ agent_id }) => {
    const res = await apiRequest<{ message?: string }>(`/api/agents/${agent_id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const errData = res.data as unknown as { error?: string };
      return { content: [{ type: "text" as const, text: `エラー: ${errData.error ?? "削除に失敗しました"} (${res.status})` }] };
    }

    return {
      content: [{ type: "text" as const, text: `エージェント (${agent_id}) を削除しました` }],
    };
  }
);

// ----------------------------------------------------------
// Tool 7: agent_log — 実行ログ取得
// ----------------------------------------------------------
server.tool(
  "agent_log",
  "エージェントの実行ログを取得する",
  {
    agent_id: z.string().optional().describe("エージェントIDでフィルタ"),
    status: z.enum(["success", "error", "running", "cancelled"]).optional().describe("ステータスでフィルタ"),
    limit: z.number().optional().describe("取得件数 (デフォルト: 10)"),
  },
  async ({ agent_id, status, limit }) => {
    const params = new URLSearchParams();
    if (agent_id) params.set("agent_id", agent_id);
    if (status) params.set("status", status);
    params.set("limit", String(limit ?? 10));

    const res = await apiRequest<{
      logs: Array<{
        id: string;
        status: string;
        input: string;
        output: string | null;
        model: string;
        input_tokens: number;
        output_tokens: number;
        cost_usd: number;
        latency_ms: number;
        error_message: string | null;
        created_at: string;
        agents?: { name: string };
      }>;
      total: number;
    }>(`/api/logs?${params}`);

    if (!res.ok) {
      return { content: [{ type: "text" as const, text: `エラー: ログの取得に失敗 (${res.status})` }] };
    }

    if (res.data.logs.length === 0) {
      return { content: [{ type: "text" as const, text: "実行ログがありません" }] };
    }

    const summary = res.data.logs.map((log) => {
      const statusIcon = log.status === "success" ? "OK" : log.status === "error" ? "NG" : log.status;
      return [
        `### [${statusIcon}] ${log.agents?.name ?? "不明"} — ${new Date(log.created_at).toLocaleString("ja-JP")}`,
        `入力: ${log.input.slice(0, 100)}${log.input.length > 100 ? "…" : ""}`,
        log.output ? `出力: ${log.output.slice(0, 200)}${log.output.length > 200 ? "…" : ""}` : "",
        log.error_message ? `エラー: ${log.error_message}` : "",
        `_${log.input_tokens}入力/${log.output_tokens}出力 | $${log.cost_usd.toFixed(4)} | ${log.latency_ms}ms_`,
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    return {
      content: [{
        type: "text" as const,
        text: `## 実行ログ (${res.data.total}件中${res.data.logs.length}件)\n\n${summary}`,
      }],
    };
  }
);

// ----------------------------------------------------------
// Tool 8: orchestrate — 自律スキル選択・生成・実行
// ----------------------------------------------------------
server.tool(
  "orchestrate",
  "ユーザーの指示に最適なスキルを自動選択し、なければ新規生成して実行する。汎用的な指示を与えるだけでAIが適切なスキルを判断する。",
  {
    input: z.string().describe("ユーザーの指示（自然言語）"),
    auto_create: z.boolean().optional().describe("スキルが見つからない場合に自動生成するか (デフォルト: true)"),
  },
  async ({ input, auto_create }) => {
    const res = await apiRequest<{
      match_type: "existing" | "created" | "none";
      skill?: { id: string; name: string; description: string; is_auto_generated: boolean };
      output?: string;
      message?: string;
      usage?: { input_tokens: number; output_tokens: number; cost_usd: number; latency_ms: number };
    }>("/api/orchestrator", {
      method: "POST",
      body: JSON.stringify({ input, auto_create: auto_create ?? true }),
    });

    if (!res.ok) {
      const errData = res.data as unknown as { error?: string };
      return { content: [{ type: "text" as const, text: `エラー: ${errData.error ?? "オーケストレーション失敗"} (${res.status})` }] };
    }

    const d = res.data;

    if (d.match_type === "none") {
      return { content: [{ type: "text" as const, text: d.message ?? "適切なスキルが見つかりませんでした" }] };
    }

    const matchLabel = d.match_type === "created" ? "新規生成" : "既存スキル";
    const usageInfo = d.usage
      ? `\n\n---\n_[${matchLabel}] ${d.skill?.name} | $${d.usage.cost_usd.toFixed(4)} | ${d.usage.latency_ms}ms_`
      : "";

    return {
      content: [{
        type: "text" as const,
        text: `${d.output ?? ""}${usageInfo}`,
      }],
    };
  }
);

// ----------------------------------------------------------
// Tool 9: skill_list — スキル一覧取得
// ----------------------------------------------------------
server.tool(
  "skill_list",
  "登録されているスキルの一覧を取得する",
  {
    search: z.string().optional().describe("名前・説明で検索"),
  },
  async ({ search }) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);

    const res = await apiRequest<{
      skills: Array<{
        id: string; name: string; description: string;
        skill_type: string; use_count: number; is_auto_generated: boolean;
        trigger_keywords: string[];
      }>;
      total: number;
    }>(`/api/skills?${params}`);

    if (!res.ok) {
      return { content: [{ type: "text" as const, text: `エラー: スキル一覧の取得に失敗 (${res.status})` }] };
    }

    const list = res.data.skills.map((s) =>
      `- **${s.name}** (${s.skill_type}${s.is_auto_generated ? ", AI生成" : ""}) — ${s.description} [${s.use_count}回使用]`
    ).join("\n");

    return {
      content: [{
        type: "text" as const,
        text: `## スキル一覧 (${res.data.total}件)\n\n${list || "スキルがありません"}`,
      }],
    };
  }
);

// ----------------------------------------------------------
// Tool 10: image_generate — 画像生成
// ----------------------------------------------------------
server.tool(
  "image_generate",
  "テキストプロンプトから画像を生成する（Gemini画像生成モデル使用）。生成された画像はBase64で返却され、ローカルにファイル保存も可能。",
  {
    prompt: z.string().describe("画像生成プロンプト（英語推奨。日本語も可）"),
    model: z.enum(["gemini-2.5-flash-image", "gemini-3-pro-image-preview", "nano-banana-pro-preview", "gemini-3.1-flash-image-preview"]).optional().describe("画像生成モデル (デフォルト: gemini-2.5-flash-image)。高品質なら gemini-3-pro-image-preview (NanobananaPro)"),
    aspect_ratio: z.enum(["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]).optional().describe("アスペクト比 (デフォルト: 16:9)"),
    image_size: z.enum(["1K", "2K", "4K"]).optional().describe("画像サイズ (デフォルト: 1K)"),
    save_path: z.string().optional().describe("画像を保存するファイルパス (例: /tmp/sakura.png)。指定しない場合はBase64のみ返却"),
  },
  async ({ prompt, model, aspect_ratio, image_size, save_path }) => {
    const res = await apiRequest<{
      image_base64: string;
      mime_type: string;
      text: string;
      model: string;
      latency_ms: number;
    }>("/api/image/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        model: model ?? "gemini-2.5-flash-image",
        aspect_ratio: aspect_ratio ?? "16:9",
        image_size: image_size ?? "1K",
      }),
    });

    if (!res.ok) {
      const errData = res.data as unknown as { error?: string };
      return { content: [{ type: "text" as const, text: `エラー: ${errData.error ?? "画像生成に失敗しました"} (${res.status})` }] };
    }

    const d = res.data;

    // ファイル保存が指定されている場合
    if (save_path) {
      try {
        const fs = await import("fs");
        const path = await import("path");
        const dir = path.dirname(save_path);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(save_path, Buffer.from(d.image_base64, "base64"));

        return {
          content: [{
            type: "text" as const,
            text: [
              `画像を生成しました: ${save_path}`,
              d.text ? `\nAIコメント: ${d.text}` : "",
              `\n---`,
              `_モデル: ${d.model} | ${d.latency_ms}ms_`,
            ].filter(Boolean).join(""),
          }],
        };
      } catch (fsErr) {
        return {
          content: [{
            type: "text" as const,
            text: `画像は生成されましたが、ファイル保存に失敗しました: ${fsErr instanceof Error ? fsErr.message : "不明なエラー"}\n\nBase64データの先頭100文字: ${d.image_base64.slice(0, 100)}...`,
          }],
        };
      }
    }

    // ファイル保存なし: Base64の要約を返す
    return {
      content: [
        {
          type: "image" as const,
          data: d.image_base64,
          mimeType: d.mime_type,
        },
        {
          type: "text" as const,
          text: [
            d.text ? `${d.text}\n` : "",
            `---`,
            `_モデル: ${d.model} | ${d.latency_ms}ms | save_path を指定するとファイルに保存できます_`,
          ].filter(Boolean).join("\n"),
        },
      ],
    };
  }
);

// ----------------------------------------------------------
// Tool 11: knowledge_search — ナレッジベース検索 (RAG)
// ----------------------------------------------------------
server.tool(
  "knowledge_search",
  "ナレッジベースからベクトル類似度検索で関連ドキュメントを取得する（RAG）。エージェントに外部知識を注入する際に使用。",
  {
    query: z.string().describe("検索クエリ（自然言語）"),
    knowledge_base_id: z.string().optional().describe("検索対象のナレッジベースID"),
    agent_id: z.string().optional().describe("エージェントIDに紐づくKBを検索"),
    match_count: z.number().optional().describe("返却件数 (デフォルト: 5)"),
  },
  async ({ query, knowledge_base_id, agent_id, match_count }) => {
    const res = await apiRequest<{
      results: Array<{
        content: string;
        similarity: number;
        document_title: string;
        chunk_index: number;
      }>;
      total: number;
      latency_ms: number;
    }>("/api/knowledge/search", {
      method: "POST",
      body: JSON.stringify({
        query,
        knowledge_base_id,
        agent_id,
        match_count: match_count ?? 5,
      }),
    });

    if (!res.ok) {
      const errData = res.data as unknown as { error?: string };
      return { content: [{ type: "text" as const, text: `エラー: ${errData.error ?? "検索に失敗しました"} (${res.status})` }] };
    }

    const d = res.data;
    if (d.results.length === 0) {
      return { content: [{ type: "text" as const, text: "関連するドキュメントが見つかりませんでした" }] };
    }

    const resultText = d.results.map((r, i) =>
      `### ${i + 1}. ${r.document_title} (${(r.similarity * 100).toFixed(0)}% 一致)\n${r.content}`
    ).join("\n\n");

    return {
      content: [{
        type: "text" as const,
        text: `## 検索結果 (${d.total}件, ${d.latency_ms}ms)\n\n${resultText}`,
      }],
    };
  }
);

// ============================================================
// サーバー起動
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Agent Builder MCP Server が起動しました");
  console.error(`  URL: ${BASE_URL}`);
  console.error(`  API Key: ${API_KEY ? "設定済み" : "未設定"}`);
}

main().catch((err) => {
  console.error("MCP Server 起動エラー:", err);
  process.exit(1);
});
