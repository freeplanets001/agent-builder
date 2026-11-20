"use client";

import { useEffect, useState, useCallback } from "react";
import type { Agent } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

/** ローカルのMCPサーバーパスを使った設定JSON */
function generateLocalConfig(appUrl: string, apiKey: string): string {
  return JSON.stringify({
    mcpServers: {
      "agent-builder": {
        command: "node",
        args: ["<PATH_TO_PROJECT>/agent-builder/mcp-server/dist/index.js"],
        env: {
          AGENT_BUILDER_URL: appUrl,
          AGENT_BUILDER_KEY: apiKey,
        },
      },
    },
  }, null, 2);
}

export default function McpPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"setup" | "keys" | "agents">("setup");

  // APIキー作成
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [activeApiKey, setActiveApiKey] = useState<string>("");

  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    setAppUrl(window.location.origin);
  }, []);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [agentRes, keyRes] = await Promise.all([
        fetch("/api/agents?limit=100"),
        fetch("/api/api-keys"),
      ]);
      if (agentRes.ok) {
        const data = await agentRes.json() as { agents: Agent[] };
        setAgents(data.agents);
      }
      if (keyRes.ok) {
        const data = await keyRes.json() as { api_keys: ApiKeyRecord[] };
        setApiKeys(data.api_keys);
      }
    } catch { /* silent */ } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* fallback */ }
  }

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);
    try {
      const workspaceId = agents[0]?.workspace_id;
      if (!workspaceId) {
        alert("先にエージェントを作成してください");
        return;
      }
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), workspace_id: workspaceId }),
      });
      const data = await res.json() as { api_key: ApiKeyRecord; secret: string; error?: string };
      if (!res.ok) {
        alert(data.error ?? "作成に失敗しました");
        return;
      }
      setGeneratedSecret(data.secret);
      setActiveApiKey(data.secret);
      setNewKeyName("");
      await fetchAll();
    } catch {
      alert("ネットワークエラー");
    } finally {
      setIsCreatingKey(false);
    }
  }

  const mcpConfig = generateLocalConfig(appUrl, activeApiKey || "<YOUR_API_KEY>");

  const stepStyle = { padding: "20px", borderRadius: "12px", border: "1px solid var(--color-border)", background: "var(--color-surface)" };
  const badgeStyle = { display: "inline-flex" as const, alignItems: "center" as const, justifyContent: "center" as const, width: "24px", height: "24px", borderRadius: "50%", background: "var(--color-primary)", color: "#fff", fontSize: "12px", fontWeight: 700 as const };
  const codeBlockStyle = { padding: "16px", borderRadius: "8px", background: "var(--color-surface-2)", border: "1px solid var(--color-border)", fontSize: "13px", overflow: "auto" as const, color: "var(--color-text)", margin: 0, lineHeight: 1.5 };

  return (
    <div style={{ padding: "32px", maxWidth: "900px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>MCP設定</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
          Claude Code / Antigravity からエージェントを呼び出す設定
        </p>
      </div>

      {/* タブ */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "1px solid var(--color-border)" }}>
        {([
          { id: "setup" as const, label: "セットアップ" },
          { id: "keys" as const, label: `APIキー (${apiKeys.length})` },
          { id: "agents" as const, label: "エージェント" },
        ]).map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 20px", fontSize: "14px", fontWeight: activeTab === tab.id ? 600 : 400,
            color: activeTab === tab.id ? "var(--color-primary)" : "var(--color-text-muted)",
            background: "transparent", border: "none",
            borderBottom: activeTab === tab.id ? "2px solid var(--color-primary)" : "2px solid transparent",
            cursor: "pointer", fontFamily: "inherit", marginBottom: "-1px",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* === セットアップタブ === */}
      {activeTab === "setup" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Step 1: APIキー発行 */}
          <section style={stepStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={badgeStyle}>1</span>
              APIキーを発行
            </h2>
            <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "16px" }}>
              MCPサーバーがAgent BuilderのAPIにアクセスするためのキーを発行します。
            </p>

            {generatedSecret ? (
              <div style={{ padding: "16px", borderRadius: "8px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#10b981", marginBottom: "8px" }}>
                  APIキーが発行されました（この画面を閉じると二度と表示されません）
                </p>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <code style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", background: "var(--color-surface-2)", fontSize: "12px", wordBreak: "break-all", color: "var(--color-text)" }}>
                    {generatedSecret}
                  </code>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(generatedSecret, "secret")}>
                    {copied === "secret" ? "OK" : "コピー"}
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <Input
                  id="key-name"
                  placeholder="キーの名前（例: MCP Server）"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
                <Button variant="primary" onClick={handleCreateKey} loading={isCreatingKey} disabled={!newKeyName.trim()}>
                  発行
                </Button>
              </div>
            )}
          </section>

          {/* Step 2: MCP設定 */}
          <section style={stepStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={badgeStyle}>2</span>
              設定をClaude Codeに追加
            </h2>
            <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "8px" }}>
              <code style={{ padding: "2px 6px", borderRadius: "4px", background: "var(--color-surface-2)", fontSize: "12px" }}>~/.claude/settings.json</code> に以下を追加。
              {activeApiKey && <span style={{ color: "#10b981", fontWeight: 600 }}> (キー自動反映済み)</span>}
            </p>
            <div style={{ position: "relative" }}>
              <pre style={codeBlockStyle}>{mcpConfig}</pre>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(mcpConfig, "config")} style={{ position: "absolute", top: "8px", right: "8px" }}>
                {copied === "config" ? "OK" : "コピー"}
              </Button>
            </div>
          </section>

          {/* Step 3: MCPサーバービルド */}
          <section style={stepStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={badgeStyle}>3</span>
              MCPサーバーをビルド
            </h2>
            <pre style={{ ...codeBlockStyle, lineHeight: 2 }}>{`cd agent-builder/mcp-server
npm install
npm run build`}</pre>
          </section>

          {/* Step 4: 使い方 */}
          <section style={stepStyle}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={badgeStyle}>4</span>
              使い方
            </h2>
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.8, display: "grid", gap: "6px" }}>
              <p style={{ marginBottom: "4px" }}>Claude Codeで使えるツール:</p>
              {[
                ["orchestrate", "自然言語で指示 → 最適なスキルを自動選択/生成して実行"],
                ["agent_list", "エージェント一覧を取得"],
                ["agent_run", "エージェントを実行"],
                ["agent_get", "エージェント詳細を取得"],
                ["agent_create", "新しいエージェントを作成"],
                ["agent_update", "エージェントを更新"],
                ["agent_delete", "エージェントを削除"],
                ["agent_log", "実行ログを取得"],
                ["skill_list", "スキル一覧を取得"],
              ].map(([name, desc]) => (
                <div key={name} style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                  <code style={{ padding: "2px 8px", borderRadius: "4px", background: "var(--color-surface-2)", fontSize: "12px", flexShrink: 0 }}>{name}</code>
                  <span style={{ fontSize: "12px" }}>— {desc}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* === APIキータブ === */}
      {activeTab === "keys" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* 新規作成 */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <Input id="new-key-name" placeholder="キーの名前" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <Button variant="primary" onClick={handleCreateKey} loading={isCreatingKey} disabled={!newKeyName.trim()}>発行</Button>
          </div>

          {generatedSecret && (
            <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", marginBottom: "8px" }}>
              <p style={{ fontSize: "12px", fontWeight: 600, color: "#10b981", marginBottom: "6px" }}>新しいキー（この画面を閉じると非表示）:</p>
              <div style={{ display: "flex", gap: "8px" }}>
                <code style={{ flex: 1, fontSize: "11px", wordBreak: "break-all", color: "var(--color-text)" }}>{generatedSecret}</code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(generatedSecret, "secret2")}>{copied === "secret2" ? "OK" : "コピー"}</Button>
              </div>
            </div>
          )}

          {isLoading && <p style={{ color: "var(--color-text-muted)" }}>読み込み中...</p>}

          {apiKeys.length === 0 && !isLoading && (
            <p style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", fontSize: "14px" }}>
              APIキーがありません。上のフォームから発行してください。
            </p>
          )}

          {apiKeys.map((key) => (
            <div key={key.id} style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--color-border)", background: "var(--color-surface)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "14px", fontWeight: 500 }}>{key.name}</span>
                <code style={{ marginLeft: "12px", fontSize: "12px", color: "var(--color-text-muted)" }}>{key.key_prefix}</code>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                <span>{key.is_active ? "有効" : "無効"}</span>
                <span>最終使用: {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString("ja-JP") : "未使用"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === エージェント一覧タブ === */}
      {activeTab === "agents" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {isLoading && <p style={{ color: "var(--color-text-muted)" }}>読み込み中...</p>}
          {!isLoading && agents.length === 0 && (
            <p style={{ textAlign: "center", padding: "60px", color: "var(--color-text-muted)", fontSize: "14px" }}>エージェントがありません。</p>
          )}
          {agents.map((agent) => (
            <div key={agent.id} style={{ padding: "16px", borderRadius: "12px", border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600 }}>{agent.name}</h3>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(
                  JSON.stringify({ name: agent.name, model: agent.model, system_prompt: agent.system_prompt, temperature: agent.temperature, max_tokens: agent.max_tokens, tags: agent.tags }, null, 2),
                  `json-${agent.id}`
                )}>{copied === `json-${agent.id}` ? "OK" : "JSONコピー"}</Button>
              </div>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                {agent.description ?? "説明なし"} — {agent.model} — ID: <code style={{ fontSize: "11px" }}>{agent.id.slice(0, 8)}...</code>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
