"use client";

import { useEffect, useState, useCallback } from "react";
import Button from "@/components/ui/Button";
import {
  LineChart, Line, BarChart as RechartsBarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface AnalyticsData {
  summary: {
    total_requests: number;
    success_count: number;
    error_count: number;
    success_rate: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost: number;
    avg_latency: number;
  };
  agent_stats: Array<{
    agent_id: string;
    name: string;
    requests: number;
    successes: number;
    errors: number;
    tokens: number;
    cost: number;
  }>;
  model_stats: Array<{
    model: string;
    requests: number;
    cost: number;
    tokens: number;
  }>;
  daily_stats: Array<{
    date: string;
    requests: number;
    cost: number;
    errors: number;
  }>;
  latency_distribution?: Array<{ range: string; count: number }>;
  hourly_stats?: Array<{ hour: number; requests: number }>;
}

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** シンプルな棒グラフ（CSSのみ） */
function BarChart({ data, maxValue }: { data: Array<{ label: string; value: number; color?: string }>; maxValue: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {data.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", width: "80px", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.label}
          </span>
          <div style={{ flex: 1, height: "20px", borderRadius: "4px", background: "var(--color-surface-2)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: maxValue > 0 ? `${Math.max(2, (item.value / maxValue) * 100)}%` : "0%",
              borderRadius: "4px",
              background: item.color ?? "var(--color-primary)",
              transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text)", width: "50px", textAlign: "right", flexShrink: 0 }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) throw new Error("分析データの取得に失敗しました");
      const json = await res.json() as AnalyticsData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const cardStyle = {
    padding: "20px",
    borderRadius: "12px",
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
  };

  return (
    <div style={{ padding: "32px", maxWidth: "1200px" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          分析
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
          エージェントの使用状況とコスト
        </p>
      </div>

      {/* エラー */}
      {error && (
        <div role="alert" style={{ padding: "16px", borderRadius: "12px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--color-error)", marginBottom: "24px" }}>
          {error}
          <Button variant="ghost" size="sm" onClick={fetchAnalytics} style={{ marginLeft: "12px" }}>再試行</Button>
        </div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: "100px", borderRadius: "12px", background: "var(--color-surface)", border: "1px solid var(--color-border)", animation: "pulse-glow 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* サマリーカード */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px", marginBottom: "28px" }}>
            <div style={cardStyle}>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>総リクエスト数</div>
              <div style={{ fontSize: "28px", fontWeight: 700 }}>{data.summary.total_requests.toLocaleString()}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>成功率</div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: data.summary.success_rate >= 90 ? "#10b981" : data.summary.success_rate >= 70 ? "#f59e0b" : "#ef4444" }}>
                {data.summary.success_rate}%
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                {data.summary.success_count}成功 / {data.summary.error_count}エラー
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>総コスト</div>
              <div style={{ fontSize: "28px", fontWeight: 700 }}>{formatCost(data.summary.total_cost)}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>平均レイテンシ</div>
              <div style={{ fontSize: "28px", fontWeight: 700 }}>
                {data.summary.avg_latency >= 1000 ? `${(data.summary.avg_latency / 1000).toFixed(1)}s` : `${data.summary.avg_latency}ms`}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>総トークン</div>
              <div style={{ fontSize: "28px", fontWeight: 700 }}>
                {formatTokens(data.summary.total_input_tokens + data.summary.total_output_tokens)}
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                入力: {formatTokens(data.summary.total_input_tokens)} / 出力: {formatTokens(data.summary.total_output_tokens)}
              </div>
            </div>
          </div>

          {/* グラフセクション */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "28px" }}>
            {/* エージェント別リクエスト */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>エージェント別リクエスト数</h2>
              {data.agent_stats.length > 0 ? (
                <BarChart
                  data={data.agent_stats.slice(0, 8).map((a) => ({ label: a.name, value: a.requests }))}
                  maxValue={Math.max(...data.agent_stats.map((a) => a.requests))}
                />
              ) : (
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>データなし</p>
              )}
            </div>

            {/* モデル別リクエスト */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>モデル別リクエスト数</h2>
              {data.model_stats.length > 0 ? (
                <BarChart
                  data={data.model_stats.map((m) => ({
                    label: m.model.replace("claude-", "").replace("-20241022", ""),
                    value: m.requests,
                    color: m.model.includes("claude") ? "var(--color-primary)" : m.model.includes("gpt") ? "#10b981" : "#f59e0b",
                  }))}
                  maxValue={Math.max(...data.model_stats.map((m) => m.requests))}
                />
              ) : (
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>データなし</p>
              )}
            </div>
          </div>

          {/* recharts: 日次トレンド + レイテンシ分布 */}
          {data.daily_stats.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "28px" }}>
              {/* 日次コスト推移 */}
              <div style={cardStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>日次コスト推移</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.daily_stats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
                    <Tooltip
                      contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                      formatter={(value) => [`$${Number(value).toFixed(4)}`, "コスト"]}
                      labelFormatter={(label) => `日付: ${label}`}
                    />
                    <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 日次リクエスト数 */}
              <div style={cardStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>日次リクエスト数</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <RechartsBarChart data={data.daily_stats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <Tooltip
                      contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="requests" fill="#3b82f6" radius={[4, 4, 0, 0]} name="リクエスト" />
                    <Bar dataKey="errors" fill="#ef4444" radius={[4, 4, 0, 0]} name="エラー" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* recharts: レイテンシ分布 + モデル別コスト円グラフ */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "28px" }}>
            {/* レイテンシ分布 */}
            {data.latency_distribution && data.latency_distribution.some((d) => d.count > 0) && (
              <div style={cardStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>レイテンシ分布</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <RechartsBarChart data={data.latency_distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <Tooltip contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="件数" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* モデル別コスト円グラフ */}
            {data.model_stats.length > 0 && (
              <div style={cardStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>モデル別コスト</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data.model_stats.map((m) => ({
                        name: m.model.replace("claude-", "").replace("-20241022", ""),
                        value: Number(m.cost.toFixed(4)),
                      }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {data.model_stats.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                      formatter={(value) => [`$${Number(value).toFixed(4)}`, "コスト"]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* エージェント別テーブル */}
          {data.agent_stats.length > 0 && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>エージェント別詳細</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      {["エージェント", "リクエスト", "成功", "エラー", "トークン", "コスト"].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--color-text-muted)", fontWeight: 500, fontSize: "12px" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.agent_stats.map((a) => (
                      <tr key={a.agent_id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 500 }}>{a.name}</td>
                        <td style={{ padding: "10px 12px" }}>{a.requests}</td>
                        <td style={{ padding: "10px 12px", color: "#10b981" }}>{a.successes}</td>
                        <td style={{ padding: "10px 12px", color: a.errors > 0 ? "#ef4444" : "var(--color-text-muted)" }}>{a.errors}</td>
                        <td style={{ padding: "10px 12px" }}>{formatTokens(a.tokens)}</td>
                        <td style={{ padding: "10px 12px" }}>{formatCost(a.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 空状態 */}
          {data.summary.total_requests === 0 && (
            <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--color-text-muted)" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
              <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "var(--color-text)" }}>
                分析データがありません
              </h2>
              <p style={{ fontSize: "14px" }}>
                エージェントを実行すると、ここに使用状況が表示されます
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
