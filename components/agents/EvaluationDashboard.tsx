"use client";

import { useEffect, useState, useCallback } from "react";
import Button from "@/components/ui/Button";

// ============================================================
// 型定義（コンポーネントローカル）
// ============================================================

interface EvalSuiteRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  eval_cases: Array<{ count: number }>;
}

interface EvalRunRow {
  id: string;
  suite_id: string;
  agent_version: number;
  model_override: string | null;
  label: string | null;
  status: "running" | "success" | "error";
  total_cases: number;
  passed_cases: number;
  avg_score: number;
  total_cost_usd: number;
  total_latency_ms: number;
  created_at: string;
  completed_at: string | null;
}

interface CaseResult {
  case_id: string;
  input: string;
  expected: string | null;
  actual: string;
  score: number;
  passed: boolean;
  reason: string;
  latency_ms: number;
  cost_usd: number;
}

interface EvalRunResponse {
  run_id: string;
  totalCases: number;
  passedCases: number;
  avgScore: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  results: CaseResult[];
}

type CriteriaType = "contains" | "exact" | "keywords" | "ai_judge" | "regex";

interface NewCase {
  input: string;
  expected_output: string;
  criteria_type: CriteriaType;
  keywords: string;
  pattern: string;
}

// ============================================================
// タブ定義
// ============================================================

type TabId = "suites" | "runs" | "results";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "suites", label: "テストスイート" },
  { id: "runs", label: "実行履歴" },
  { id: "results", label: "詳細結果" },
];

const EMPTY_CASE: NewCase = {
  input: "",
  expected_output: "",
  criteria_type: "contains",
  keywords: "",
  pattern: "",
};

// ============================================================
// メインコンポーネント
// ============================================================

interface Props {
  agentId: string;
  agentName: string;
}

export default function EvaluationDashboard({ agentId }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("suites");
  const [suites, setSuites] = useState<EvalSuiteRow[]>([]);
  const [runs, setRuns] = useState<EvalRunRow[]>([]);
  const [selectedResults, setSelectedResults] = useState<CaseResult[] | null>(null);
  const [selectedRunLabel, setSelectedRunLabel] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // スイート作成フォーム
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [suiteName, setSuiteName] = useState("");
  const [suiteDescription, setSuiteDescription] = useState("");
  const [newCases, setNewCases] = useState<NewCase[]>([{ ...EMPTY_CASE }]);

  // A/Bテスト用
  const [abMode, setAbMode] = useState(false);
  const [modelOverrideB, setModelOverrideB] = useState("");
  const [promptOverrideB, setPromptOverrideB] = useState("");
  const [abResults, setAbResults] = useState<{ a: EvalRunResponse; b: EvalRunResponse } | null>(null);

  // ============================================================
  // データ取得
  // ============================================================

  const fetchSuites = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/evaluate/suites`);
      if (res.ok) {
        const data = await res.json() as { suites: EvalSuiteRow[] };
        setSuites(data.suites);
      }
    } catch {
      setError("テストスイートの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/evaluate`);
      if (res.ok) {
        const data = await res.json() as { runs: EvalRunRow[] };
        setRuns(data.runs);
      }
    } catch {
      setError("実行履歴の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchSuites();
    fetchRuns();
  }, [fetchSuites, fetchRuns]);

  // ============================================================
  // スイート作成
  // ============================================================

  const handleCreateSuite = async () => {
    if (!suiteName.trim()) return;
    const validCases = newCases.filter((c) => c.input.trim());
    if (validCases.length === 0) {
      setError("少なくとも1つのテストケースが必要です");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/evaluate/suites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: suiteName.trim(),
          description: suiteDescription.trim() || undefined,
          cases: validCases.map((c) => ({
            input: c.input.trim(),
            expected_output: c.expected_output.trim() || undefined,
            eval_criteria: buildCriteria(c),
          })),
        }),
      });

      if (res.ok) {
        setSuiteName("");
        setSuiteDescription("");
        setNewCases([{ ...EMPTY_CASE }]);
        setShowCreateForm(false);
        await fetchSuites();
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
  // 評価実行
  // ============================================================

  const runEvaluation = async (suiteId: string) => {
    setIsRunning(true);
    setError(null);
    setAbResults(null);

    try {
      if (abMode && (modelOverrideB.trim() || promptOverrideB.trim())) {
        // A/Bテスト: 2つの設定で並行実行
        const [resA, resB] = await Promise.all([
          fetch(`/api/agents/${agentId}/evaluate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ suite_id: suiteId, label: "A" }),
          }),
          fetch(`/api/agents/${agentId}/evaluate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              suite_id: suiteId,
              label: "B",
              model_override: modelOverrideB.trim() || undefined,
              prompt_override: promptOverrideB.trim() || undefined,
            }),
          }),
        ]);

        if (resA.ok && resB.ok) {
          const dataA = await resA.json() as EvalRunResponse;
          const dataB = await resB.json() as EvalRunResponse;
          setAbResults({ a: dataA, b: dataB });
          setActiveTab("results");
        } else {
          setError("A/Bテスト実行中にエラーが発生しました");
        }
      } else {
        // 通常実行
        const res = await fetch(`/api/agents/${agentId}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suite_id: suiteId }),
        });

        if (res.ok) {
          const data = await res.json() as EvalRunResponse;
          setSelectedResults(data.results);
          setSelectedRunLabel(`スコア: ${Math.round(data.avgScore * 100)}% (${data.passedCases}/${data.totalCases} 合格)`);
          setActiveTab("results");
        } else {
          const errData = await res.json() as { error?: string };
          setError(errData.error ?? "評価実行に失敗しました");
        }
      }

      await fetchRuns();
    } catch {
      setError("評価実行に失敗しました");
    } finally {
      setIsRunning(false);
    }
  };

  // ============================================================
  // ヘルパー
  // ============================================================

  const addCase = () => {
    setNewCases((prev) => [...prev, { ...EMPTY_CASE }]);
  };

  const removeCase = (index: number) => {
    setNewCases((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCase = (index: number, field: keyof NewCase, value: string) => {
    setNewCases((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const getCaseCount = (suite: EvalSuiteRow) => {
    return suite.eval_cases?.[0]?.count ?? 0;
  };

  const viewRunResults = (run: EvalRunRow) => {
    // 実行詳細を取得（resultsフィールドがGETレスポンスに含まれていないため、再実行は不要）
    setSelectedRunLabel(
      `v${run.agent_version} ${run.model_override ? `(${run.model_override})` : ""} — ` +
      `${Math.round(run.avg_score * 100)}% (${run.passed_cases}/${run.total_cases} 合格)`
    );
    setSelectedResults(null);
    setActiveTab("results");
  };

  // ============================================================
  // レンダリング
  // ============================================================

  return (
    <div>
      {/* エラー表示 */}
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

      {/* タブ */}
      <div style={{
        display: "flex",
        gap: "4px",
        marginBottom: "24px",
        padding: "4px",
        background: "var(--color-surface-2)",
        borderRadius: "12px",
        width: "fit-content",
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === tab.id ? "var(--color-surface)" : "transparent",
              color: activeTab === tab.id ? "var(--color-text)" : "var(--color-text-muted)",
              fontSize: "13px",
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: activeTab === tab.id ? "var(--shadow-sm)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* テストスイートタブ */}
      {activeTab === "suites" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 600 }}>テストスイート</h2>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-text-muted)" }}>
                <input
                  type="checkbox"
                  checked={abMode}
                  onChange={(e) => setAbMode(e.target.checked)}
                  style={{ accentColor: "var(--color-primary)" }}
                />
                A/Bテスト
              </label>
              <Button variant="primary" size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
                {showCreateForm ? "キャンセル" : "+ 新規スイート"}
              </Button>
            </div>
          </div>

          {/* A/Bテスト設定 */}
          {abMode && (
            <div className="glass" style={{
              padding: "16px 20px",
              borderRadius: "14px",
              marginBottom: "20px",
            }}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>A/Bテスト設定（B側）</h3>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>モデル上書き</label>
                  <input
                    type="text"
                    value={modelOverrideB}
                    onChange={(e) => setModelOverrideB(e.target.value)}
                    placeholder="例: gpt-4o-mini"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 2, minWidth: "300px" }}>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>プロンプト上書き</label>
                  <input
                    type="text"
                    value={promptOverrideB}
                    onChange={(e) => setPromptOverrideB(e.target.value)}
                    placeholder="B側のシステムプロンプト（空欄=同じプロンプト）"
                    style={inputStyle}
                  />
                </div>
              </div>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "8px" }}>
                A側はエージェントの現在設定、B側は上書き設定で同じテストケースを実行します
              </p>
            </div>
          )}

          {/* スイート作成フォーム */}
          {showCreateForm && (
            <div className="glass" style={{
              padding: "24px",
              borderRadius: "16px",
              marginBottom: "24px",
            }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>新規テストスイート</h3>

              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>スイート名 *</label>
                  <input
                    type="text"
                    value={suiteName}
                    onChange={(e) => setSuiteName(e.target.value)}
                    placeholder="例: 基本応答テスト"
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>説明</label>
                  <input
                    type="text"
                    value={suiteDescription}
                    onChange={(e) => setSuiteDescription(e.target.value)}
                    placeholder="テストスイートの説明（任意）"
                    style={inputStyle}
                  />
                </div>
              </div>

              <h4 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>テストケース</h4>

              {newCases.map((c, i) => (
                <div key={i} style={{
                  padding: "14px",
                  marginBottom: "10px",
                  borderRadius: "10px",
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)" }}>ケース #{i + 1}</span>
                    {newCases.length > 1 && (
                      <button onClick={() => removeCase(i)} style={removeBtnStyle}>×</button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>入力 *</label>
                      <textarea
                        value={c.input}
                        onChange={(e) => updateCase(i, "input", e.target.value)}
                        placeholder="エージェントへの入力メッセージ"
                        rows={2}
                        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>期待される出力</label>
                      <textarea
                        value={c.expected_output}
                        onChange={(e) => updateCase(i, "expected_output", e.target.value)}
                        placeholder="期待される応答（任意）"
                        rows={2}
                        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                    <div>
                      <label style={labelStyle}>評価方法</label>
                      <select
                        value={c.criteria_type}
                        onChange={(e) => updateCase(i, "criteria_type", e.target.value)}
                        style={inputStyle}
                      >
                        <option value="contains">部分一致 (contains)</option>
                        <option value="exact">完全一致 (exact)</option>
                        <option value="keywords">キーワード (keywords)</option>
                        <option value="regex">正規表現 (regex)</option>
                        <option value="ai_judge">AI判定 (ai_judge)</option>
                      </select>
                    </div>
                    {c.criteria_type === "keywords" && (
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>キーワード（カンマ区切り）</label>
                        <input
                          type="text"
                          value={c.keywords}
                          onChange={(e) => updateCase(i, "keywords", e.target.value)}
                          placeholder="例: API, REST, JSON"
                          style={inputStyle}
                        />
                      </div>
                    )}
                    {c.criteria_type === "regex" && (
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>正規表現パターン</label>
                        <input
                          type="text"
                          value={c.pattern}
                          onChange={(e) => updateCase(i, "pattern", e.target.value)}
                          placeholder="例: \\d{3}-\\d{4}"
                          style={inputStyle}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <Button variant="ghost" size="sm" onClick={addCase}>+ ケース追加</Button>
                <div style={{ flex: 1 }} />
                <Button variant="primary" size="sm" onClick={handleCreateSuite} loading={isLoading} disabled={!suiteName.trim()}>
                  スイートを作成
                </Button>
              </div>
            </div>
          )}

          {/* スイート一覧 */}
          {isLoading && suites.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", textAlign: "center", padding: "40px" }}>読み込み中...</p>
          ) : suites.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
              <p style={{ fontSize: "15px", marginBottom: "8px" }}>テストスイートがありません</p>
              <p style={{ fontSize: "13px" }}>「新規スイート」からテストケースを作成してください</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {suites.map((suite) => (
                <div
                  key={suite.id}
                  className="glass"
                  style={{
                    padding: "16px 20px",
                    borderRadius: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 600 }}>{suite.name}</span>
                      <span style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: "var(--color-surface-2)",
                        color: "var(--color-text-muted)",
                      }}>
                        {getCaseCount(suite)} ケース
                      </span>
                    </div>
                    {suite.description && (
                      <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                        {suite.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => runEvaluation(suite.id)}
                    loading={isRunning}
                    disabled={isRunning}
                  >
                    {abMode ? "A/Bテスト実行" : "評価実行"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 実行履歴タブ */}
      {activeTab === "runs" && (
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "20px" }}>実行履歴</h2>

          {runs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
              <p style={{ fontSize: "15px" }}>実行履歴がありません</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["日時", "ラベル", "モデル", "ステータス", "スコア", "合格率", "コスト", "レイテンシ", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "var(--color-text-muted)", fontSize: "12px" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={cellStyle}>{new Date(run.created_at).toLocaleString("ja-JP")}</td>
                      <td style={cellStyle}>
                        {run.label && (
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: run.label === "A" ? "rgba(99, 102, 241, 0.1)" : "rgba(245, 158, 11, 0.1)",
                            color: run.label === "A" ? "var(--color-primary)" : "var(--color-warning)",
                          }}>
                            {run.label}
                          </span>
                        )}
                      </td>
                      <td style={cellStyle}>{run.model_override ?? "-"}</td>
                      <td style={cellStyle}>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background: statusColors[run.status].bg,
                          color: statusColors[run.status].text,
                        }}>
                          {statusLabels[run.status]}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <ScoreBar score={run.avg_score} />
                      </td>
                      <td style={cellStyle}>{run.passed_cases}/{run.total_cases}</td>
                      <td style={cellStyle}>${(run.total_cost_usd * 1000).toFixed(2)}m</td>
                      <td style={cellStyle}>{Math.round(run.total_latency_ms)}ms</td>
                      <td style={cellStyle}>
                        <button
                          onClick={() => viewRunResults(run)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-primary)",
                            cursor: "pointer",
                            fontSize: "12px",
                            textDecoration: "underline",
                          }}
                        >
                          詳細
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 詳細結果タブ */}
      {activeTab === "results" && (
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>詳細結果</h2>

          {abResults ? (
            // A/B比較ビュー
            <ABComparisonView a={abResults.a} b={abResults.b} />
          ) : selectedResults ? (
            // 通常結果ビュー
            <>
              <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "20px" }}>{selectedRunLabel}</p>
              <ResultsTable results={selectedResults} />
            </>
          ) : selectedRunLabel ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>
              <p style={{ fontSize: "14px", marginBottom: "8px" }}>{selectedRunLabel}</p>
              <p style={{ fontSize: "12px" }}>個別結果の詳細は評価実行直後のみ表示されます</p>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
              <p style={{ fontSize: "15px" }}>テストスイートを実行すると結果がここに表示されます</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// サブコンポーネント
// ============================================================

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "var(--color-success)" : pct >= 50 ? "var(--color-warning)" : "var(--color-error, #ef4444)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ width: "60px", height: "6px", borderRadius: "3px", background: "var(--color-surface-2)" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: "3px", background: color, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: "12px", fontWeight: 600, color }}>{pct}%</span>
    </div>
  );
}

function ResultsTable({ results }: { results: CaseResult[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {results.map((r, i) => (
        <div
          key={r.case_id || i}
          className="glass"
          style={{
            borderRadius: "12px",
            overflow: "hidden",
            border: `1px solid ${r.passed ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
          }}
        >
          {/* ヘッダー行 */}
          <button
            onClick={() => toggle(r.case_id || String(i))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "100%",
              padding: "12px 16px",
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              color: "var(--color-text)",
            }}
          >
            <span style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              flexShrink: 0,
              background: r.passed ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
              color: r.passed ? "var(--color-success)" : "var(--color-error, #ef4444)",
            }}>
              {r.passed ? "✓" : "✗"}
            </span>
            <span style={{ flex: 1, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.input.slice(0, 80)}{r.input.length > 80 ? "..." : ""}
            </span>
            <ScoreBar score={r.score} />
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", flexShrink: 0 }}>{r.latency_ms}ms</span>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", transform: expanded.has(r.case_id || String(i)) ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
          </button>

          {/* 展開コンテンツ */}
          {expanded.has(r.case_id || String(i)) && (
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <DetailBlock label="入力" content={r.input} />
              {r.expected && <DetailBlock label="期待出力" content={r.expected} />}
              <DetailBlock label="実際の出力" content={r.actual} />
              <DetailBlock label="判定理由" content={r.reason} />
              <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                <span>コスト: ${(r.cost_usd * 1000).toFixed(3)}m</span>
                <span>レイテンシ: {r.latency_ms}ms</span>
                <span>スコア: {Math.round(r.score * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DetailBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>{label}</span>
      <div style={{
        padding: "8px 12px",
        borderRadius: "8px",
        background: "var(--color-surface-2)",
        fontSize: "13px",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: "200px",
        overflowY: "auto",
      }}>
        {content}
      </div>
    </div>
  );
}

function ABComparisonView({ a, b }: { a: EvalRunResponse; b: EvalRunResponse }) {
  return (
    <div>
      {/* サマリー比較 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        {[
          { label: "A (現在の設定)", data: a, color: "var(--color-primary)" },
          { label: "B (上書き設定)", data: b, color: "var(--color-warning)" },
        ].map(({ label, data, color }) => (
          <div key={label} className="glass" style={{ padding: "20px", borderRadius: "14px", borderTop: `3px solid ${color}` }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px", color }}>{label}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <StatItem label="平均スコア" value={`${Math.round(data.avgScore * 100)}%`} />
              <StatItem label="合格率" value={`${data.passedCases}/${data.totalCases}`} />
              <StatItem label="コスト" value={`$${(data.totalCostUsd * 1000).toFixed(2)}m`} />
              <StatItem label="レイテンシ" value={`${Math.round(data.totalLatencyMs)}ms`} />
            </div>
          </div>
        ))}
      </div>

      {/* ケース別比較 */}
      <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>ケース別比較</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {a.results.map((ra, i) => {
          const rb = b.results[i];
          if (!rb) return null;
          return (
            <div key={ra.case_id || i} className="glass" style={{ padding: "14px 18px", borderRadius: "12px" }}>
              <p style={{ fontSize: "13px", fontWeight: 500, marginBottom: "10px" }}>
                {ra.input.slice(0, 100)}{ra.input.length > 100 ? "..." : ""}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ padding: "8px 12px", borderRadius: "8px", background: ra.passed ? "rgba(34, 197, 94, 0.05)" : "rgba(239, 68, 68, 0.05)", border: "1px solid var(--color-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-primary)" }}>A</span>
                    <ScoreBar score={ra.score} />
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--color-text-muted)", lineHeight: 1.5 }}>{ra.actual.slice(0, 150)}{ra.actual.length > 150 ? "..." : ""}</p>
                </div>
                <div style={{ padding: "8px 12px", borderRadius: "8px", background: rb.passed ? "rgba(34, 197, 94, 0.05)" : "rgba(239, 68, 68, 0.05)", border: "1px solid var(--color-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-warning)" }}>B</span>
                    <ScoreBar score={rb.score} />
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--color-text-muted)", lineHeight: 1.5 }}>{rb.actual.slice(0, 150)}{rb.actual.length > 150 ? "..." : ""}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block" }}>{label}</span>
      <span style={{ fontSize: "18px", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

// ============================================================
// ヘルパー関数
// ============================================================

function buildCriteria(c: NewCase): Record<string, unknown> {
  const criteria: Record<string, unknown> = { type: c.criteria_type };
  if (c.criteria_type === "keywords" && c.keywords.trim()) {
    criteria.keywords = c.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  }
  if (c.criteria_type === "regex" && c.pattern.trim()) {
    criteria.pattern = c.pattern.trim();
  }
  return criteria;
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

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};

const removeBtnStyle: React.CSSProperties = {
  width: "20px",
  height: "20px",
  borderRadius: "50%",
  background: "rgba(239, 68, 68, 0.1)",
  color: "var(--color-error, #ef4444)",
  border: "none",
  fontSize: "14px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const statusColors: Record<string, { bg: string; text: string }> = {
  running: { bg: "rgba(245, 158, 11, 0.1)", text: "var(--color-warning)" },
  success: { bg: "rgba(34, 197, 94, 0.1)", text: "var(--color-success)" },
  error: { bg: "rgba(239, 68, 68, 0.1)", text: "var(--color-error, #ef4444)" },
};

const statusLabels: Record<string, string> = {
  running: "実行中",
  success: "完了",
  error: "エラー",
};
