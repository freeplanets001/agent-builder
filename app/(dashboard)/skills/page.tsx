"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { Skill } from "@/lib/types";
import Button from "@/components/ui/Button";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  meta?: {
    match_type?: "existing" | "created" | "none";
    skill_name?: string;
    cost_usd?: number;
    latency_ms?: number;
    is_auto_generated?: boolean;
  };
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"chat" | "registry">("chat");

  // チャット状態
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: "system",
    content: "何でも指示してください。適切なスキルを自動で選択、なければ新しく作成して実行します。",
  }]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchSkills = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json() as { skills: Skill[] };
        setSkills(data.skills);
      }
    } catch { /* silent */ } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function handleSend() {
    if (!chatInput.trim() || isSending) return;
    const input = chatInput.trim();
    setChatInput("");

    setMessages((prev) => [...prev, { role: "user", content: input }]);
    setIsSending(true);

    try {
      const res = await fetch("/api/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });

      const data = await res.json() as {
        match_type: "existing" | "created" | "none";
        skill?: { id: string; name: string; description: string; is_auto_generated: boolean };
        output?: string;
        message?: string;
        usage?: { input_tokens: number; output_tokens: number; cost_usd: number; latency_ms: number };
      };

      if (!res.ok) {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: `エラー: ${(data as unknown as { error: string }).error ?? "実行に失敗しました"}`,
        }]);
        return;
      }

      if (data.match_type === "none") {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: data.message ?? "適切なスキルが見つかりませんでした。",
          meta: { match_type: "none" },
        }]);
        return;
      }

      const matchLabel = data.match_type === "created"
        ? `新しいスキル「${data.skill?.name}」を自動生成しました`
        : `スキル「${data.skill?.name}」を使用しました`;

      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.output ?? "(出力なし)",
        meta: {
          match_type: data.match_type,
          skill_name: data.skill?.name,
          cost_usd: data.usage?.cost_usd,
          latency_ms: data.usage?.latency_ms,
          is_auto_generated: data.skill?.is_auto_generated,
        },
      }]);

      // スキル一覧を更新
      if (data.match_type === "created") {
        await fetchSkills();
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "ネットワークエラーが発生しました",
      }]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteSkill(id: string) {
    if (!confirm("このスキルを削除しますか？")) return;
    await fetch(`/api/skills/${id}`, { method: "DELETE" });
    await fetchSkills();
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", height: "calc(100vh - 64px)", display: "flex", flexDirection: "column" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          スキル
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
          AIが自律的にスキルを選択・生成して実行
        </p>
      </div>

      {/* タブ */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px", borderBottom: "1px solid var(--color-border)" }}>
        {([
          { id: "chat" as const, label: "オーケストレーター" },
          { id: "registry" as const, label: `スキル一覧 (${skills.length})` },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px", fontSize: "14px",
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? "var(--color-primary)" : "var(--color-text-muted)",
              background: "transparent", border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--color-primary)" : "2px solid transparent",
              cursor: "pointer", fontFamily: "inherit", marginBottom: "-1px",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* オーケストレーターチャット */}
      {activeTab === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* メッセージ一覧 */}
          <div style={{
            flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px",
            padding: "16px", borderRadius: "12px", border: "1px solid var(--color-border)",
            background: "var(--color-surface)", marginBottom: "12px",
          }}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: msg.role === "system" ? "100%" : "80%",
                }}
              >
                {/* メタ情報バッジ */}
                {msg.meta && msg.meta.match_type && (
                  <div style={{ fontSize: "11px", marginBottom: "4px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: "4px",
                      background: msg.meta.match_type === "created" ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.12)",
                      color: msg.meta.match_type === "created" ? "#f59e0b" : "#10b981",
                      fontWeight: 600,
                    }}>
                      {msg.meta.match_type === "created" ? "自動生成" : "既存スキル"}
                    </span>
                    {msg.meta.skill_name && (
                      <span style={{ padding: "2px 8px", borderRadius: "4px", background: "rgba(124,110,242,0.1)", color: "var(--color-primary)", fontWeight: 500 }}>
                        {msg.meta.skill_name}
                      </span>
                    )}
                    {msg.meta.cost_usd != null && (
                      <span style={{ color: "var(--color-text-muted)" }}>
                        ${msg.meta.cost_usd.toFixed(4)} | {msg.meta.latency_ms}ms
                      </span>
                    )}
                  </div>
                )}

                <div style={{
                  padding: msg.role === "system" ? "12px 16px" : "10px 14px",
                  borderRadius: "12px",
                  background: msg.role === "user"
                    ? "var(--color-primary)"
                    : msg.role === "system"
                      ? "rgba(124,110,242,0.06)"
                      : "var(--color-surface-2)",
                  color: msg.role === "user" ? "#fff" : "var(--color-text)",
                  fontSize: msg.role === "system" ? "13px" : "14px",
                  textAlign: msg.role === "system" ? "center" : "left",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  border: msg.role === "system" ? "1px solid var(--color-border)" : "none",
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div style={{ alignSelf: "flex-start", padding: "10px 14px", borderRadius: "12px", background: "var(--color-surface-2)", fontSize: "14px", color: "var(--color-text-muted)" }}>
                考え中...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 入力 */}
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              placeholder="何でも指示してください... (例: この記事を要約して、コード書いて、翻訳して)"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isSending}
              style={{
                flex: 1, padding: "12px 16px", borderRadius: "12px",
                background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
                color: "var(--color-text)", fontSize: "14px", fontFamily: "inherit", outline: "none",
              }}
            />
            <Button variant="primary" onClick={handleSend} loading={isSending} disabled={!chatInput.trim()}>
              送信
            </Button>
          </div>
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px", textAlign: "center" }}>
            Cmd/Ctrl + Enter で送信
          </p>
        </div>
      )}

      {/* スキルレジストリ */}
      {activeTab === "registry" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isLoading && <p style={{ color: "var(--color-text-muted)", padding: "24px", textAlign: "center" }}>読み込み中...</p>}

          {!isLoading && skills.length === 0 && (
            <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--color-text-muted)" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🧠</div>
              <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "var(--color-text)" }}>
                スキルがありません
              </h2>
              <p style={{ fontSize: "14px" }}>
                オーケストレーターに指示すると、必要なスキルが自動生成されます
              </p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {skills.map((skill) => (
              <div
                key={skill.id}
                style={{
                  padding: "16px 20px", borderRadius: "12px",
                  border: "1px solid var(--color-border)", background: "var(--color-surface)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>{skill.name}</span>
                    <span style={{
                      fontSize: "11px", padding: "2px 6px", borderRadius: "4px",
                      background: skill.skill_type === "prompt" ? "rgba(124,110,242,0.1)" : skill.skill_type === "command" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                      color: skill.skill_type === "prompt" ? "var(--color-primary)" : skill.skill_type === "command" ? "#10b981" : "#f59e0b",
                      fontWeight: 600,
                    }}>
                      {skill.skill_type}
                    </span>
                    {skill.is_auto_generated && (
                      <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontWeight: 600 }}>
                        AI生成
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {skill.use_count}回使用
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteSkill(skill.id)} style={{ color: "var(--color-error)" }}>
                      削除
                    </Button>
                  </div>
                </div>
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "6px" }}>
                  {skill.description}
                </p>
                {skill.trigger_keywords.length > 0 && (
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {skill.trigger_keywords.map((kw) => (
                      <span key={kw} style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: "var(--color-surface-2)", color: "var(--color-text-muted)" }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
