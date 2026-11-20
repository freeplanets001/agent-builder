"use client";

import { useEffect, useState, useCallback } from "react";
import type { ExecutionLog, LogStatus } from "@/lib/types";
import Button from "@/components/ui/Button";

/** ステータスバッジの色定義 */
const STATUS_CONFIG: Record<LogStatus, { label: string; color: string; bg: string }> = {
  running: { label: "実行中", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  success: { label: "成功", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  error: { label: "エラー", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  cancelled: { label: "中止", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

function formatCost(usd: number): string {
  if (usd < 0.001) return "< $0.001";
  return `$${usd.toFixed(4)}`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

interface TraceEvent {
  timestamp: string;
  event: string;
  duration_ms?: number;
  data: Record<string, unknown>;
}

interface LogWithAgent extends ExecutionLog {
  agents?: { name: string };
  debug_trace?: TraceEvent[] | null;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogWithAgent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const LIMIT = 30;

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(LIMIT));
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/logs?${params}`);
      if (!res.ok) throw new Error("ログの取得に失敗しました");
      const data = await res.json() as { logs: LogWithAgent[]; total: number };
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ padding: "32px", maxWidth: "1200px" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          実行ログ
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
          {isLoading ? "読み込み中..." : `${total}件のログ`}
        </p>
      </div>

      {/* フィルター */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { value: "", label: "すべて" },
          { value: "success", label: "成功" },
          { value: "error", label: "エラー" },
          { value: "running", label: "実行中" },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setStatusFilter(value); setPage(1); }}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              border: `1px solid ${statusFilter === value ? "var(--color-primary)" : "var(--color-border)"}`,
              background: statusFilter === value ? "rgba(124,110,242,0.1)" : "transparent",
              color: statusFilter === value ? "var(--color-primary)" : "var(--color-text-muted)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* エラー */}
      {error && (
        <div
          role="alert"
          style={{
            padding: "16px",
            borderRadius: "12px",
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.3)",
            color: "var(--color-error)",
            marginBottom: "24px",
          }}
        >
          {error}
          <Button variant="ghost" size="sm" onClick={fetchLogs} style={{ marginLeft: "12px" }}>
            再試行
          </Button>
        </div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                height: "64px",
                borderRadius: "12px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                animation: "pulse-glow 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      )}

      {/* 空状態 */}
      {!isLoading && !error && logs.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--color-text-muted)" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "var(--color-text)" }}>
            実行ログがありません
          </h2>
          <p style={{ fontSize: "14px" }}>
            エージェントを実行すると、ここにログが表示されます
          </p>
        </div>
      )}

      {/* ログリスト */}
      {!isLoading && logs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {logs.map((log) => {
            const statusInfo = STATUS_CONFIG[log.status];
            const isExpanded = expandedId === log.id;

            return (
              <div key={log.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "100px 1fr 100px 80px 80px 80px",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    borderRadius: isExpanded ? "12px 12px 0 0" : "12px",
                    border: `1px solid ${isExpanded ? "var(--color-primary)" : "var(--color-border)"}`,
                    borderBottom: isExpanded ? "none" : undefined,
                    background: isExpanded ? "rgba(124,110,242,0.04)" : "var(--color-surface)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* ステータス */}
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: statusInfo.color,
                      background: statusInfo.bg,
                      textAlign: "center",
                    }}
                  >
                    {statusInfo.label}
                  </span>

                  {/* エージェント名 + 入力プレビュー */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text)" }}>
                      {log.agents?.name ?? "不明なエージェント"}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--color-text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {log.input.slice(0, 80)}
                    </div>
                  </div>

                  {/* モデル */}
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                    {log.model.replace("claude-", "").replace("-20241022", "")}
                  </span>

                  {/* レイテンシ */}
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted)", textAlign: "right" }}>
                    {log.latency_ms > 0 ? formatLatency(log.latency_ms) : "—"}
                  </span>

                  {/* コスト */}
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted)", textAlign: "right" }}>
                    {log.cost_usd > 0 ? formatCost(log.cost_usd) : "—"}
                  </span>

                  {/* 時刻 */}
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", textAlign: "right" }}>
                    {timeAgo(log.created_at)}
                  </span>
                </button>

                {/* 展開パネル */}
                {isExpanded && (
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "0 0 12px 12px",
                      border: "1px solid var(--color-primary)",
                      borderTop: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: "16px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                      <span>入力トークン: <strong style={{ color: "var(--color-text)" }}>{log.input_tokens.toLocaleString()}</strong></span>
                      <span>出力トークン: <strong style={{ color: "var(--color-text)" }}>{log.output_tokens.toLocaleString()}</strong></span>
                      <span>コスト: <strong style={{ color: "var(--color-text)" }}>{formatCost(log.cost_usd)}</strong></span>
                      <span>実行時間: <strong style={{ color: "var(--color-text)" }}>{formatLatency(log.latency_ms)}</strong></span>
                      <span>モデル: <strong style={{ color: "var(--color-text)" }}>{log.model}</strong></span>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        入力
                      </div>
                      <pre style={{
                        padding: "12px", borderRadius: "8px", background: "var(--color-surface-2)",
                        border: "1px solid var(--color-border)", fontSize: "13px", whiteSpace: "pre-wrap",
                        wordBreak: "break-word", maxHeight: "200px", overflow: "auto", color: "var(--color-text)", margin: 0,
                      }}>
                        {log.input}
                      </pre>
                    </div>

                    {log.output && (
                      <div style={{ marginBottom: "12px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          出力
                        </div>
                        <pre style={{
                          padding: "12px", borderRadius: "8px", background: "var(--color-surface-2)",
                          border: "1px solid var(--color-border)", fontSize: "13px", whiteSpace: "pre-wrap",
                          wordBreak: "break-word", maxHeight: "400px", overflow: "auto", color: "var(--color-text)", margin: 0,
                        }}>
                          {log.output}
                        </pre>
                      </div>
                    )}

                    {log.error_message && (
                      <div style={{ marginBottom: "12px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-error)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          エラー
                        </div>
                        <pre style={{
                          padding: "12px", borderRadius: "8px", background: "rgba(239,68,68,0.06)",
                          border: "1px solid rgba(239,68,68,0.2)", fontSize: "13px", whiteSpace: "pre-wrap",
                          wordBreak: "break-word", color: "var(--color-error)", margin: 0,
                        }}>
                          {log.error_message}
                        </pre>
                      </div>
                    )}

                    {/* デバッグトレース タイムライン */}
                    {log.debug_trace && Array.isArray(log.debug_trace) && log.debug_trace.length > 0 && (
                      <DebugTimeline trace={log.debug_trace} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "24px" }}>
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            前へ
          </Button>
          <span style={{ display: "flex", alignItems: "center", fontSize: "13px", color: "var(--color-text-muted)" }}>
            {page} / {totalPages}
          </span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            次へ
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// デバッグトレース タイムラインコンポーネント
// ============================================================

const TRACE_EVENT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  prompt_build:    { label: "プロンプト構築", color: "#6366f1", icon: "📝" },
  rag_search:      { label: "RAG検索",       color: "#8b5cf6", icon: "🔍" },
  memory_search:   { label: "メモリ検索",    color: "#a78bfa", icon: "🧠" },
  guardrail_input: { label: "入力ガード",    color: "#f59e0b", icon: "🛡️" },
  guardrail_output:{ label: "出力ガード",    color: "#f59e0b", icon: "🛡️" },
  cost_check:      { label: "コストチェック", color: "#10b981", icon: "💰" },
  ai_call_start:   { label: "AI呼び出し開始", color: "#3b82f6", icon: "🤖" },
  ai_call_end:     { label: "AI呼び出し完了", color: "#3b82f6", icon: "✅" },
  tool_call:       { label: "ツール呼び出し", color: "#ec4899", icon: "🔧" },
  tool_result:     { label: "ツール結果",     color: "#ec4899", icon: "📤" },
  schema_validate: { label: "スキーマ検証",   color: "#14b8a6", icon: "📋" },
  schema_retry:    { label: "スキーマリトライ", color: "#f97316", icon: "🔄" },
  memory_extract:  { label: "メモリ抽出",     color: "#a78bfa", icon: "💾" },
  image_generate:  { label: "画像生成",       color: "#f472b6", icon: "🖼️" },
  error:           { label: "エラー",         color: "#ef4444", icon: "❌" },
};

function DebugTimeline({ trace }: { trace: TraceEvent[] }) {
  const [expanded, setExpanded] = useState(false);

  if (trace.length === 0) return null;

  const totalDuration = trace[trace.length - 1]?.duration_ms ?? 0;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: "none", border: "none", cursor: "pointer",
          fontSize: "11px", fontWeight: 600, color: "var(--color-primary)",
          padding: "4px 0",
        }}
      >
        <span style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
        デバッグトレース ({trace.length} イベント, {totalDuration}ms)
      </button>

      {expanded && (
        <div style={{
          marginTop: "8px", padding: "12px", borderRadius: "10px",
          background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
        }}>
          {/* タイムラインバー */}
          {totalDuration > 0 && (
            <div style={{
              height: "24px", borderRadius: "4px", background: "var(--color-surface)",
              border: "1px solid var(--color-border)", position: "relative", marginBottom: "16px",
              overflow: "hidden",
            }}>
              {trace.filter((e) => e.duration_ms !== undefined).map((e, i) => {
                const left = totalDuration > 0 ? ((e.duration_ms ?? 0) / totalDuration) * 100 : 0;
                const config = TRACE_EVENT_LABELS[e.event] ?? { color: "#6b7280" };
                return (
                  <div
                    key={i}
                    title={`${TRACE_EVENT_LABELS[e.event]?.label ?? e.event} (${e.duration_ms}ms)`}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      top: "2px",
                      width: "3px",
                      height: "20px",
                      borderRadius: "1px",
                      background: config.color,
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* イベントリスト */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {trace.map((event, i) => {
              const config = TRACE_EVENT_LABELS[event.event] ?? { label: event.event, color: "#6b7280", icon: "•" };
              const dataStr = Object.keys(event.data).length > 0
                ? Object.entries(event.data)
                    .filter(([k]) => k !== "status")
                    .map(([k, v]) => `${k}: ${typeof v === "string" ? v.slice(0, 80) : JSON.stringify(v)}`)
                    .join(" | ")
                : "";

              return (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: "8px",
                  padding: "4px 6px", borderRadius: "4px",
                  background: event.event === "error" ? "rgba(239,68,68,0.05)" : "transparent",
                }}>
                  <span style={{ fontSize: "12px", flexShrink: 0 }}>{config.icon}</span>
                  <span style={{
                    fontSize: "11px", fontWeight: 600, color: config.color,
                    minWidth: "110px", flexShrink: 0,
                  }}>
                    {config.label}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", minWidth: "50px", flexShrink: 0, textAlign: "right" }}>
                    {event.duration_ms !== undefined ? `${event.duration_ms}ms` : ""}
                  </span>
                  {dataStr && (
                    <span style={{
                      fontSize: "11px", color: "var(--color-text-muted)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {dataStr}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
