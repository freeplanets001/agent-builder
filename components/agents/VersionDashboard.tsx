"use client";

import { useEffect, useState, useCallback } from "react";
import Button from "@/components/ui/Button";

// ============================================================
// 型定義
// ============================================================

type DeployStatus = "draft" | "canary" | "active" | "archived";

interface AgentVersion {
  id: string;
  agent_id: string;
  version: number;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  change_description: string | null;
  deploy_status: DeployStatus;
  canary_percent: number;
  created_by: string;
  created_at: string;
}

const STATUS_CONFIG: Record<DeployStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "下書き", color: "var(--color-text-muted)", bg: "var(--color-surface-2)" },
  canary: { label: "カナリア", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  active: { label: "本番", color: "var(--color-success)", bg: "rgba(34,197,94,0.1)" },
  archived: { label: "アーカイブ", color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
};

// ============================================================
// メインコンポーネント
// ============================================================

interface Props {
  agentId: string;
  currentPrompt: string;
  currentVersion: number;
}

export default function VersionDashboard({ agentId, currentPrompt, currentVersion }: Props) {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<AgentVersion | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [canaryInput, setCanaryInput] = useState<{ versionNum: number; percent: number } | null>(null);

  const fetchVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/versions`);
      if (res.ok) {
        const data = await res.json() as { versions: AgentVersion[] };
        setVersions(data.versions);
      }
    } catch {
      setError("バージョンの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // ============================================================
  // デプロイアクション
  // ============================================================

  const doAction = async (version: number, action: string, canaryPercent?: number) => {
    setActionLoading(`${version}-${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          action,
          canary_percent: canaryPercent,
        }),
      });
      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        setError(errData.error ?? "操作に失敗しました");
      } else {
        await fetchVersions();
        setCanaryInput(null);
      }
    } catch {
      setError("操作に失敗しました");
    } finally {
      setActionLoading(null);
    }
  };

  // ============================================================
  // Diff表示
  // ============================================================

  const computeDiff = (oldText: string, newText: string) => {
    const oldLines = oldText.split("\n");
    const newLines = newText.split("\n");
    const result: Array<{ type: "same" | "add" | "remove"; text: string }> = [];

    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === newLine) {
        result.push({ type: "same", text: oldLine ?? "" });
      } else {
        if (oldLine !== undefined) result.push({ type: "remove", text: oldLine });
        if (newLine !== undefined) result.push({ type: "add", text: newLine });
      }
    }
    return result;
  };

  // ============================================================
  // レンダリング
  // ============================================================

  if (isLoading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-muted)" }}>読み込み中...</div>;
  }

  return (
    <div>
      {error && (
        <div style={{
          padding: "12px 16px", marginBottom: "16px", borderRadius: "10px",
          background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)",
          color: "var(--color-error, #ef4444)", fontSize: "13px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "16px" }}>×</button>
        </div>
      )}

      {/* Diffモーダル */}
      {diffTarget && (
        <div className="glass" style={{ padding: "20px", borderRadius: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600 }}>
              v{currentVersion} (現在) vs v{diffTarget.version} の差分
            </h3>
            <button onClick={() => setDiffTarget(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "16px" }}>×</button>
          </div>
          <div style={{
            fontFamily: "monospace", fontSize: "12px", lineHeight: 1.8,
            padding: "12px", borderRadius: "8px", background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)", maxHeight: "400px", overflowY: "auto",
          }}>
            {computeDiff(currentPrompt, diffTarget.system_prompt).map((line, i) => (
              <div key={i} style={{
                padding: "1px 6px",
                background: line.type === "add" ? "rgba(34,197,94,0.08)" : line.type === "remove" ? "rgba(239,68,68,0.08)" : "transparent",
                color: line.type === "add" ? "var(--color-success)" : line.type === "remove" ? "var(--color-error, #ef4444)" : "var(--color-text)",
              }}>
                <span style={{ userSelect: "none", color: "var(--color-text-muted)", marginRight: "8px" }}>
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                </span>
                {line.text || " "}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* バージョン数 */}
      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "16px" }}>
        {versions.length} バージョン
      </p>

      {/* バージョン一覧 */}
      {versions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-muted)" }}>
          <p style={{ fontSize: "15px", marginBottom: "8px" }}>バージョン履歴がありません</p>
          <p style={{ fontSize: "13px" }}>エージェントを編集・保存するとバージョンが自動作成されます</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {versions.map((ver) => {
            const status = STATUS_CONFIG[ver.deploy_status ?? "draft"];
            const isExpanded = expandedId === ver.id;
            const isCurrent = ver.version === currentVersion;

            return (
              <div key={ver.id} className="glass" style={{ borderRadius: "12px", overflow: "hidden" }}>
                {/* ヘッダー行 */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : ver.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: "12px",
                    padding: "12px 16px", background: "none", border: "none",
                    cursor: "pointer", textAlign: "left", color: "var(--color-text)",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: 700, minWidth: "40px" }}>v{ver.version}</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                    color: status.color, background: status.bg,
                  }}>
                    {status.label}
                    {ver.deploy_status === "canary" && ver.canary_percent > 0 && ` (${ver.canary_percent}%)`}
                  </span>
                  {isCurrent && (
                    <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "rgba(99,102,241,0.1)", color: "var(--color-primary)", fontWeight: 600 }}>現在</span>
                  )}
                  <span style={{ flex: 1, fontSize: "12px", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ver.change_description ?? ver.model}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", flexShrink: 0 }}>
                    {new Date(ver.created_at).toLocaleDateString("ja-JP")}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
                </button>

                {/* 展開コンテンツ */}
                {isExpanded && (
                  <div style={{ padding: "0 16px 16px" }}>
                    {/* メタ情報 */}
                    <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "12px", flexWrap: "wrap" }}>
                      <span>モデル: <strong style={{ color: "var(--color-text)" }}>{ver.model}</strong></span>
                      <span>温度: <strong style={{ color: "var(--color-text)" }}>{ver.temperature}</strong></span>
                      <span>最大トークン: <strong style={{ color: "var(--color-text)" }}>{ver.max_tokens}</strong></span>
                    </div>

                    {/* プロンプト */}
                    <div style={{ marginBottom: "12px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: "4px" }}>システムプロンプト</span>
                      <pre style={{
                        padding: "10px 12px", borderRadius: "8px", background: "var(--color-surface-2)",
                        border: "1px solid var(--color-border)", fontSize: "12px", lineHeight: 1.6,
                        whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "200px", overflowY: "auto",
                        margin: 0, color: "var(--color-text)",
                      }}>
                        {ver.system_prompt}
                      </pre>
                    </div>

                    {/* アクションボタン */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      {!isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDiffTarget(ver)}
                        >
                          差分を表示
                        </Button>
                      )}

                      {ver.deploy_status !== "active" && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => doAction(ver.version, "activate")}
                          loading={actionLoading === `${ver.version}-activate`}
                        >
                          本番にデプロイ
                        </Button>
                      )}

                      {ver.deploy_status !== "canary" && ver.deploy_status !== "active" && (
                        <>
                          {canaryInput?.versionNum === ver.version ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={canaryInput.percent}
                                onChange={(e) => setCanaryInput({ ...canaryInput, percent: parseInt(e.target.value) || 10 })}
                                style={{
                                  width: "60px", padding: "4px 8px", borderRadius: "6px",
                                  background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
                                  color: "var(--color-text)", fontSize: "12px", textAlign: "center",
                                }}
                              />
                              <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>%</span>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => doAction(ver.version, "canary", canaryInput.percent)}
                                loading={actionLoading === `${ver.version}-canary`}
                              >
                                カナリア開始
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setCanaryInput(null)}>取消</Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCanaryInput({ versionNum: ver.version, percent: 10 })}
                            >
                              カナリアリリース
                            </Button>
                          )}
                        </>
                      )}

                      {ver.deploy_status === "canary" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => doAction(ver.version, "activate")}
                          loading={actionLoading === `${ver.version}-activate`}
                        >
                          全量リリース
                        </Button>
                      )}

                      {ver.deploy_status !== "archived" && ver.deploy_status !== "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => doAction(ver.version, "archive")}
                          loading={actionLoading === `${ver.version}-archive`}
                        >
                          アーカイブ
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
