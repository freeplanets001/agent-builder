"use client";

import { useEffect, useState, useCallback } from "react";
import type { Automation, Agent, AutomationTriggerType, WorkflowStep } from "@/lib/types";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const TRIGGER_LABELS: Record<AutomationTriggerType, { icon: string; label: string }> = {
  schedule: { icon: "clock", label: "スケジュール" },
  webhook: { icon: "link", label: "Webhook" },
  workflow: { icon: "flow", label: "ワークフロー" },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "未実行";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  // 作成フォーム
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<AutomationTriggerType>("schedule");
  const [formAgentId, setFormAgentId] = useState("");
  const [formInput, setFormInput] = useState("");
  const [formCron, setFormCron] = useState("0 9 * * *");
  const [formSteps, setFormSteps] = useState<WorkflowStep[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [autoRes, agentRes] = await Promise.all([
        fetch("/api/automations"),
        fetch("/api/agents?limit=100"),
      ]);
      if (!autoRes.ok) throw new Error("自動化の取得に失敗しました");
      const autoData = await autoRes.json() as { automations: Automation[] };
      setAutomations(autoData.automations);
      if (agentRes.ok) {
        const agentData = await agentRes.json() as { agents: Agent[] };
        setAgents(agentData.agents);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleCreate() {
    if (!formName.trim()) return;
    setIsCreating(true);
    setError(null);

    // ワークスペースIDを取得（最初のエージェントから）
    const workspaceId = agents[0]?.workspace_id;
    if (!workspaceId) {
      setError("ワークスペースが見つかりません。先にエージェントを作成してください。");
      setIsCreating(false);
      return;
    }

    const triggerConfig: Record<string, unknown> = {};
    if (formType === "schedule") {
      triggerConfig.cron = formCron;
      triggerConfig.timezone = "Asia/Tokyo";
    } else if (formType === "workflow") {
      triggerConfig.steps = formSteps;
    }

    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: formName.trim(),
          trigger_type: formType,
          trigger_config: triggerConfig,
          agent_id: formType !== "workflow" ? formAgentId || null : null,
          input_template: formInput || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "作成に失敗しました");
      }
      setShowCreate(false);
      setFormName("");
      setFormInput("");
      setFormSteps([]);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRun(automationId: string) {
    setRunningId(automationId);
    try {
      const res = await fetch(`/api/automations/${automationId}/run`, { method: "POST" });
      const data = await res.json() as { output?: string; error?: string };
      if (!res.ok) {
        alert(`実行エラー: ${data.error ?? "不明なエラー"}`);
      } else {
        alert(`実行完了:\n${data.output?.slice(0, 300) ?? "(出力なし)"}`);
        await fetchAll();
      }
    } catch {
      alert("実行中にエラーが発生しました");
    } finally {
      setRunningId(null);
    }
  }

  async function handleToggle(automation: Automation) {
    await fetch(`/api/automations/${automation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !automation.is_active }),
    });
    await fetchAll();
  }

  async function handleDelete(id: string) {
    if (!confirm("この自動化を削除しますか？")) return;
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    await fetchAll();
  }

  function addWorkflowStep() {
    setFormSteps([...formSteps, { agent_id: agents[0]?.id ?? "", input_template: "{{prev_output}}" }]);
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1200px" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>自動化</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
            スケジュール・Webhook・ワークフローでエージェントを自動実行
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "閉じる" : "+ 新しい自動化"}
        </Button>
      </div>

      {/* エラー */}
      {error && (
        <div role="alert" style={{ padding: "16px", borderRadius: "12px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--color-error)", marginBottom: "24px" }}>
          {error}
        </div>
      )}

      {/* 作成フォーム */}
      {showCreate && (
        <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid var(--color-primary)", background: "rgba(124,110,242,0.04)", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>新しい自動化を作成</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Input id="auto-name" label="名前" placeholder="例: 毎朝の市場レポート" value={formName} onChange={(e) => setFormName(e.target.value)} />

            {/* トリガー種別 */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "8px", display: "block" }}>
                トリガー種別
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {(["schedule", "webhook", "workflow"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormType(t)}
                    style={{
                      flex: 1, padding: "10px", borderRadius: "8px",
                      border: `1px solid ${formType === t ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: formType === t ? "rgba(124,110,242,0.1)" : "var(--color-surface-2)",
                      color: formType === t ? "var(--color-primary)" : "var(--color-text-muted)",
                      fontSize: "13px", fontWeight: formType === t ? 600 : 400, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {TRIGGER_LABELS[t].label}
                  </button>
                ))}
              </div>
            </div>

            {/* スケジュール設定 */}
            {formType === "schedule" && (
              <Input id="auto-cron" label="Cron式" placeholder="0 9 * * *" value={formCron} onChange={(e) => setFormCron(e.target.value)} hint="例: 0 9 * * * = 毎朝9時, */30 * * * * = 30分毎" />
            )}

            {/* エージェント選択（スケジュール・Webhook） */}
            {formType !== "workflow" && (
              <div>
                <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "8px", display: "block" }}>
                  実行するエージェント
                </label>
                <select
                  value={formAgentId}
                  onChange={(e) => setFormAgentId(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: "10px",
                    background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
                    color: "var(--color-text)", fontSize: "14px", fontFamily: "inherit",
                  }}
                >
                  <option value="">選択してください</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 入力テンプレート */}
            {formType !== "workflow" && (
              <div>
                <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "8px", display: "block" }}>
                  入力テンプレート
                </label>
                <textarea
                  placeholder="エージェントへの入力。Webhookペイロードを {{key}} で参照可能"
                  value={formInput}
                  onChange={(e) => setFormInput(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: "10px",
                    background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
                    color: "var(--color-text)", fontSize: "14px", fontFamily: "inherit", resize: "vertical",
                  }}
                />
              </div>
            )}

            {/* ワークフローステップ */}
            {formType === "workflow" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-muted)" }}>
                    ワークフローステップ
                  </label>
                  <Button type="button" variant="ghost" size="sm" onClick={addWorkflowStep}>
                    + ステップ追加
                  </Button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {formSteps.map((step, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "8px", borderRadius: "8px", background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)", width: "24px" }}>
                        {idx + 1}.
                      </span>
                      <select
                        value={step.agent_id}
                        onChange={(e) => {
                          const newSteps = [...formSteps];
                          newSteps[idx] = { ...step, agent_id: e.target.value };
                          setFormSteps(newSteps);
                        }}
                        style={{ flex: 1, padding: "6px", borderRadius: "6px", background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit" }}
                      >
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <input
                        placeholder="入力テンプレート ({{prev_output}})"
                        value={step.input_template}
                        onChange={(e) => {
                          const newSteps = [...formSteps];
                          newSteps[idx] = { ...step, input_template: e.target.value };
                          setFormSteps(newSteps);
                        }}
                        style={{ flex: 2, padding: "6px 8px", borderRadius: "6px", background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit" }}
                      />
                      <button
                        type="button"
                        onClick={() => setFormSteps(formSteps.filter((_, i) => i !== idx))}
                        style={{ padding: "4px 8px", borderRadius: "4px", border: "none", background: "transparent", color: "var(--color-error)", cursor: "pointer", fontSize: "14px" }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                  {formSteps.length === 0 && (
                    <p style={{ fontSize: "13px", color: "var(--color-text-muted)", padding: "12px", textAlign: "center" }}>
                      ステップを追加してワークフローを構築してください
                    </p>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)} disabled={isCreating}>キャンセル</Button>
              <Button type="button" variant="primary" onClick={handleCreate} loading={isCreating} disabled={!formName.trim()}>
                作成
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: "80px", borderRadius: "12px", background: "var(--color-surface)", border: "1px solid var(--color-border)", animation: "pulse-glow 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      )}

      {/* 空状態 */}
      {!isLoading && !error && automations.length === 0 && !showCreate && (
        <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--color-text-muted)" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔄</div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "var(--color-text)" }}>
            自動化がありません
          </h2>
          <p style={{ fontSize: "14px", marginBottom: "24px" }}>
            スケジュール実行、Webhookトリガー、ワークフローを作成しましょう
          </p>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            最初の自動化を作成
          </Button>
        </div>
      )}

      {/* 自動化リスト */}
      {!isLoading && automations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {automations.map((auto) => (
            <div
              key={auto.id}
              style={{
                padding: "16px 20px",
                borderRadius: "12px",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              {/* トリガーアイコン */}
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: "36px", height: "36px", borderRadius: "8px",
                background: auto.is_active ? "rgba(124,110,242,0.1)" : "var(--color-surface-2)",
                fontSize: "16px", flexShrink: 0,
              }}>
                {auto.trigger_type === "schedule" ? "⏰" : auto.trigger_type === "webhook" ? "🔗" : "🔄"}
              </span>

              {/* 情報 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 500 }}>{auto.name}</span>
                  <span style={{
                    fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
                    background: auto.is_active ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                    color: auto.is_active ? "#10b981" : "#6b7280",
                    fontWeight: 600,
                  }}>
                    {auto.is_active ? "有効" : "無効"}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                  {TRIGGER_LABELS[auto.trigger_type].label}
                  {auto.agents?.name ? ` — ${auto.agents.name}` : ""}
                  {" | "}
                  最終実行: {timeAgo(auto.last_run_at)}
                  {" | "}
                  {auto.run_count}回実行
                </div>
              </div>

              {/* アクション */}
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRun(auto.id)}
                  loading={runningId === auto.id}
                  disabled={!!runningId}
                >
                  実行
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggle(auto)}>
                  {auto.is_active ? "無効化" : "有効化"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(auto.id)} style={{ color: "var(--color-error)" }}>
                  削除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
