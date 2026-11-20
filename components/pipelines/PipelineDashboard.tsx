"use client";

import { useEffect, useState, useCallback } from "react";
import Button from "@/components/ui/Button";

// ============================================================
// 型定義
// ============================================================

interface PipelineStepDef {
  agent_id: string;
  role?: string;
  input_template: string;
}

interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  steps: PipelineStepDef[];
  is_active: boolean;
  created_at: string;
}

interface StepResult {
  agent_id: string;
  agent_name: string;
  role: string;
  input: string;
  output: string;
  cost_usd: number;
  latency_ms: number;
}

interface RunResult {
  run_id: string;
  status: "success" | "error";
  output: string | null;
  stepResults: StepResult[];
  totalCostUsd: number;
  totalLatencyMs: number;
  errorMessage?: string;
}

interface AgentOption {
  id: string;
  name: string;
  model: string;
}

// テンプレート変数ヘルパー
const TEMPLATE_VARS = [
  { var: "{{original_input}}", desc: "初期入力" },
  { var: "{{prev_output}}", desc: "直前ステップの出力" },
  { var: "{{step_N_output}}", desc: "N番目ステップの出力" },
];

// ============================================================
// メインコンポーネント
// ============================================================

export default function PipelineDashboard() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 作成フォーム
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<PipelineStepDef[]>([
    { agent_id: "", role: "", input_template: "{{original_input}}" },
  ]);

  // 実行
  const [runningPipelineId, setRunningPipelineId] = useState<string | null>(null);
  const [runInput, setRunInput] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // ============================================================
  // データ取得
  // ============================================================

  const fetchPipelines = useCallback(async () => {
    try {
      const res = await fetch("/api/pipelines");
      if (res.ok) {
        const data = await res.json() as { pipelines: Pipeline[] };
        setPipelines(data.pipelines);
      }
    } catch {
      setError("パイプラインの取得に失敗しました");
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json() as { agents: AgentOption[] };
        setAgents(data.agents);
      }
    } catch {
      // エージェント取得失敗は非致命的
    }
  }, []);

  useEffect(() => {
    fetchPipelines();
    fetchAgents();
  }, [fetchPipelines, fetchAgents]);

  // ============================================================
  // パイプライン作成
  // ============================================================

  const handleCreate = async () => {
    if (!name.trim()) return;
    const validSteps = steps.filter((s) => s.agent_id);
    if (validSteps.length === 0) {
      setError("少なくとも1つのステップにエージェントを選択してください");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          steps: validSteps,
        }),
      });

      if (res.ok) {
        setName("");
        setDescription("");
        setSteps([{ agent_id: "", role: "", input_template: "{{original_input}}" }]);
        setShowCreate(false);
        await fetchPipelines();
      } else {
        const errData = await res.json() as { error?: string };
        setError(errData.error ?? "作成に失敗しました");
      }
    } catch {
      setError("作成に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // パイプライン実行
  // ============================================================

  const handleRun = async (pipelineId: string) => {
    if (!runInput.trim()) return;
    setIsRunning(true);
    setRunResult(null);
    setError(null);

    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_id: pipelineId,
          input: runInput.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json() as RunResult;
        setRunResult(data);
      } else {
        const errData = await res.json() as { error?: string };
        setError(errData.error ?? "実行に失敗しました");
      }
    } catch {
      setError("実行に失敗しました");
    } finally {
      setIsRunning(false);
    }
  };

  // ============================================================
  // ステップ操作
  // ============================================================

  const addStep = () => {
    setSteps((prev) => [...prev, {
      agent_id: "",
      role: "",
      input_template: prev.length === 0 ? "{{original_input}}" : "{{prev_output}}",
    }]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: keyof PipelineStepDef, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const getAgentName = (agentId: string) => {
    return agents.find((a) => a.id === agentId)?.name ?? agentId.slice(0, 8);
  };

  // ============================================================
  // レンダリング
  // ============================================================

  return (
    <div>
      {/* エラー */}
      {error && (
        <div style={{
          padding: "12px 16px",
          marginBottom: "16px",
          borderRadius: "10px",
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          color: "var(--color-error, #ef4444)",
          fontSize: "13px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "16px" }}>×</button>
        </div>
      )}

      {/* アクションバー */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>{pipelines.length} パイプライン</span>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "キャンセル" : "+ 新規パイプライン"}
        </Button>
      </div>

      {/* 作成フォーム */}
      {showCreate && (
        <div className="glass" style={{ padding: "24px", borderRadius: "16px", marginBottom: "24px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>新規パイプライン</h3>

          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>パイプライン名 *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 調査→執筆→レビュー" style={inputStyle} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>説明</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="パイプラインの説明（任意）" style={inputStyle} />
            </div>
          </div>

          {/* テンプレート変数ヘルプ */}
          <div style={{
            padding: "10px 14px",
            borderRadius: "8px",
            background: "rgba(99, 102, 241, 0.05)",
            border: "1px solid rgba(99, 102, 241, 0.1)",
            marginBottom: "16px",
            fontSize: "12px",
            color: "var(--color-text-muted)",
          }}>
            <span style={{ fontWeight: 600 }}>テンプレート変数: </span>
            {TEMPLATE_VARS.map((v, i) => (
              <span key={v.var}>
                <code style={{ background: "var(--color-surface-2)", padding: "1px 4px", borderRadius: "3px", fontSize: "11px" }}>{v.var}</code>
                {" "}{v.desc}{i < TEMPLATE_VARS.length - 1 ? " | " : ""}
              </span>
            ))}
          </div>

          {/* ステップ一覧 */}
          <h4 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>ステップ</h4>

          {steps.map((step, i) => (
            <div key={i} style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-start",
              padding: "14px",
              marginBottom: "8px",
              borderRadius: "10px",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
            }}>
              {/* ステップ番号 */}
              <div style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "var(--gradient-primary)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 700,
                flexShrink: 0,
                marginTop: "18px",
              }}>
                {i + 1}
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>エージェント *</label>
                    <select value={step.agent_id} onChange={(e) => updateStep(i, "agent_id", e.target.value)} style={inputStyle}>
                      <option value="">-- 選択 --</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name} ({a.model})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>役割</label>
                    <input type="text" value={step.role ?? ""} onChange={(e) => updateStep(i, "role", e.target.value)} placeholder="例: researcher" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>入力テンプレート</label>
                  <textarea
                    value={step.input_template}
                    onChange={(e) => updateStep(i, "input_template", e.target.value)}
                    placeholder="{{prev_output}} を使って前のステップの出力を参照"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
              </div>

              {steps.length > 1 && (
                <button onClick={() => removeStep(i)} style={{
                  width: "24px", height: "24px", borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.1)", color: "var(--color-error, #ef4444)",
                  border: "none", fontSize: "14px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginTop: "18px", flexShrink: 0,
                }}>×</button>
              )}
            </div>
          ))}

          {/* ステップ間の矢印表示 */}
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <Button variant="ghost" size="sm" onClick={addStep}>+ ステップ追加</Button>
            <div style={{ flex: 1 }} />
            <Button variant="primary" size="sm" onClick={handleCreate} loading={isLoading} disabled={!name.trim()}>
              パイプラインを作成
            </Button>
          </div>
        </div>
      )}

      {/* パイプライン一覧 */}
      {pipelines.length === 0 && !showCreate ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>🔗</div>
          <p style={{ fontSize: "15px", marginBottom: "8px" }}>パイプラインがありません</p>
          <p style={{ fontSize: "13px" }}>複数のエージェントを連鎖させてワークフローを構築しましょう</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {pipelines.map((pl) => (
            <div key={pl.id} className="glass" style={{ borderRadius: "16px", overflow: "hidden" }}>
              {/* パイプラインヘッダー */}
              <div style={{
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "15px", fontWeight: 600 }}>{pl.name}</span>
                    <span style={{
                      fontSize: "11px", padding: "2px 8px", borderRadius: "6px",
                      background: "var(--color-surface-2)", color: "var(--color-text-muted)",
                    }}>
                      {pl.steps.length} ステップ
                    </span>
                  </div>
                  {pl.description && (
                    <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{pl.description}</p>
                  )}
                  {/* ステップフロー表示 */}
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "8px", flexWrap: "wrap" }}>
                    {pl.steps.map((s, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{
                          fontSize: "11px", padding: "3px 8px", borderRadius: "6px",
                          background: "rgba(99, 102, 241, 0.08)", color: "var(--color-primary)",
                          fontWeight: 500,
                        }}>
                          {s.role || getAgentName(s.agent_id)}
                        </span>
                        {i < pl.steps.length - 1 && (
                          <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>→</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setRunningPipelineId(runningPipelineId === pl.id ? null : pl.id);
                    setRunResult(null);
                    setRunInput("");
                  }}
                >
                  {runningPipelineId === pl.id ? "閉じる" : "実行"}
                </Button>
              </div>

              {/* 実行パネル */}
              {runningPipelineId === pl.id && (
                <div style={{
                  padding: "16px 20px",
                  borderTop: "1px solid var(--color-border)",
                  background: "var(--color-surface-2)",
                }}>
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>入力テキスト</label>
                      <textarea
                        value={runInput}
                        onChange={(e) => setRunInput(e.target.value)}
                        placeholder="パイプラインに渡す初期入力..."
                        rows={3}
                        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRun(pl.id)}
                      loading={isRunning}
                      disabled={!runInput.trim() || isRunning}
                      style={{ flexShrink: 0 }}
                    >
                      実行開始
                    </Button>
                  </div>

                  {/* 実行結果 */}
                  {runResult && (
                    <div>
                      {/* サマリー */}
                      <div style={{
                        display: "flex", gap: "16px", marginBottom: "16px", padding: "12px 16px",
                        borderRadius: "10px",
                        background: runResult.status === "success" ? "rgba(34, 197, 94, 0.05)" : "rgba(239, 68, 68, 0.05)",
                        border: `1px solid ${runResult.status === "success" ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                      }}>
                        <StatItem label="ステータス" value={runResult.status === "success" ? "成功" : "エラー"} />
                        <StatItem label="合計コスト" value={`$${(runResult.totalCostUsd * 1000).toFixed(2)}m`} />
                        <StatItem label="合計レイテンシ" value={`${Math.round(runResult.totalLatencyMs)}ms`} />
                        <StatItem label="ステップ数" value={`${runResult.stepResults.length}`} />
                      </div>

                      {/* エラーメッセージ */}
                      {runResult.errorMessage && (
                        <div style={{
                          padding: "10px 14px", borderRadius: "8px", marginBottom: "12px",
                          background: "rgba(239, 68, 68, 0.08)", fontSize: "13px",
                          color: "var(--color-error, #ef4444)",
                        }}>
                          {runResult.errorMessage}
                        </div>
                      )}

                      {/* ステップ詳細 */}
                      <h4 style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>ステップ詳細</h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {runResult.stepResults.map((sr, i) => (
                          <StepResultCard key={i} step={sr} index={i} />
                        ))}
                      </div>

                      {/* 最終出力 */}
                      {runResult.output && (
                        <div style={{ marginTop: "16px" }}>
                          <h4 style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>最終出力</h4>
                          <div style={{
                            padding: "12px 16px", borderRadius: "10px",
                            background: "var(--color-surface)", border: "1px solid var(--color-border)",
                            fontSize: "13px", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word",
                            maxHeight: "300px", overflowY: "auto",
                          }}>
                            {runResult.output}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// サブコンポーネント
// ============================================================

function StepResultCard({ step, index }: { step: StepResult; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      borderRadius: "10px",
      border: "1px solid var(--color-border)",
      overflow: "hidden",
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: "10px", width: "100%",
          padding: "10px 14px", background: "none", border: "none",
          cursor: "pointer", textAlign: "left", color: "var(--color-text)",
        }}
      >
        <span style={{
          width: "24px", height: "24px", borderRadius: "50%",
          background: "var(--gradient-primary)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "11px", fontWeight: 700, flexShrink: 0,
        }}>
          {index + 1}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 500, flex: 1 }}>
          {step.agent_name}{step.role ? ` (${step.role})` : ""}
        </span>
        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{step.latency_ms}ms</span>
        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>${(step.cost_usd * 1000).toFixed(3)}m</span>
        <span style={{ fontSize: "11px", color: "var(--color-text-muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <DetailBlock label="入力" content={step.input} />
          <DetailBlock label="出力" content={step.output} />
        </div>
      )}
    </div>
  );
}

function DetailBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: "3px" }}>{label}</span>
      <div style={{
        padding: "8px 12px", borderRadius: "8px", background: "var(--color-surface-2)",
        fontSize: "12px", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
        maxHeight: "150px", overflowY: "auto",
      }}>
        {content}
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block" }}>{label}</span>
      <span style={{ fontSize: "15px", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

// ============================================================
// スタイル定数
// ============================================================

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "8px",
  background: "var(--color-surface-2)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
  fontSize: "13px",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  marginBottom: "4px",
};
