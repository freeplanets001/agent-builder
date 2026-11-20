/**
 * 分析 API
 * GET /api/analytics — execution_logs からサマリー統計を集計して返す
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated || !auth.supabase) {
      return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
    }
    const supabase = auth.supabase;

    // 全ログを取得（ユーザーのワークスペースのみ — RLSで制御）
    const { data: logs, error: logsError } = await supabase
      .from("execution_logs")
      .select("status, input_tokens, output_tokens, cost_usd, latency_ms, model, agent_id, created_at, agents!inner(name)")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (logsError) {
      console.error("[GET /api/analytics] DBエラー:", logsError);
      return errorResponse(`DBエラー: ${logsError.message}`, "DB_ERROR", 500);
    }

    const allLogs = logs ?? [];

    // 全体サマリー
    const totalRequests = allLogs.length;
    const successCount = allLogs.filter((l) => l.status === "success").length;
    const errorCount = allLogs.filter((l) => l.status === "error").length;
    const totalInputTokens = allLogs.reduce((sum, l) => sum + (l.input_tokens ?? 0), 0);
    const totalOutputTokens = allLogs.reduce((sum, l) => sum + (l.output_tokens ?? 0), 0);
    const totalCost = allLogs.reduce((sum, l) => sum + (l.cost_usd ?? 0), 0);
    const avgLatency = totalRequests > 0
      ? Math.round(allLogs.reduce((sum, l) => sum + (l.latency_ms ?? 0), 0) / totalRequests)
      : 0;

    // エージェント別集計
    const agentMap = new Map<string, {
      name: string;
      requests: number;
      successes: number;
      errors: number;
      tokens: number;
      cost: number;
    }>();

    for (const log of allLogs) {
      const agentId = log.agent_id;
      const agentName = (log.agents as unknown as { name: string })?.name ?? "不明";
      const existing = agentMap.get(agentId) ?? {
        name: agentName,
        requests: 0,
        successes: 0,
        errors: 0,
        tokens: 0,
        cost: 0,
      };
      existing.requests += 1;
      if (log.status === "success") existing.successes += 1;
      if (log.status === "error") existing.errors += 1;
      existing.tokens += (log.input_tokens ?? 0) + (log.output_tokens ?? 0);
      existing.cost += (log.cost_usd ?? 0);
      agentMap.set(agentId, existing);
    }

    const agentStats = Array.from(agentMap.entries()).map(([id, stats]) => ({
      agent_id: id,
      ...stats,
    })).sort((a, b) => b.requests - a.requests);

    // モデル別集計
    const modelMap = new Map<string, { requests: number; cost: number; tokens: number }>();
    for (const log of allLogs) {
      const model = log.model ?? "unknown";
      const existing = modelMap.get(model) ?? { requests: 0, cost: 0, tokens: 0 };
      existing.requests += 1;
      existing.cost += (log.cost_usd ?? 0);
      existing.tokens += (log.input_tokens ?? 0) + (log.output_tokens ?? 0);
      modelMap.set(model, existing);
    }

    const modelStats = Array.from(modelMap.entries()).map(([model, stats]) => ({
      model,
      ...stats,
    })).sort((a, b) => b.requests - a.requests);

    // 日別集計（直近30日）
    const dailyMap = new Map<string, { requests: number; cost: number; errors: number }>();
    for (const log of allLogs) {
      const day = log.created_at.slice(0, 10);
      const existing = dailyMap.get(day) ?? { requests: 0, cost: 0, errors: 0 };
      existing.requests += 1;
      existing.cost += (log.cost_usd ?? 0);
      if (log.status === "error") existing.errors += 1;
      dailyMap.set(day, existing);
    }

    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // レイテンシ分布（ヒストグラム用）
    const latencyRanges = [
      { label: "0-500ms", min: 0, max: 500 },
      { label: "500ms-1s", min: 500, max: 1000 },
      { label: "1-2s", min: 1000, max: 2000 },
      { label: "2-5s", min: 2000, max: 5000 },
      { label: "5-10s", min: 5000, max: 10000 },
      { label: "10s+", min: 10000, max: Infinity },
    ];
    const latencyDistribution = latencyRanges.map(({ label, min, max }) => ({
      range: label,
      count: allLogs.filter((l) => (l.latency_ms ?? 0) >= min && (l.latency_ms ?? 0) < max).length,
    }));

    // 時間帯別集計（0-23時）
    const hourlyMap = new Map<number, number>();
    for (let h = 0; h < 24; h++) hourlyMap.set(h, 0);
    for (const log of allLogs) {
      const hour = new Date(log.created_at).getHours();
      hourlyMap.set(hour, (hourlyMap.get(hour) ?? 0) + 1);
    }
    const hourlyStats = Array.from(hourlyMap.entries())
      .map(([hour, requests]) => ({ hour, requests }))
      .sort((a, b) => a.hour - b.hour);

    return NextResponse.json({
      summary: {
        total_requests: totalRequests,
        success_count: successCount,
        error_count: errorCount,
        success_rate: totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 0,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_cost: totalCost,
        avg_latency: avgLatency,
      },
      agent_stats: agentStats,
      model_stats: modelStats,
      daily_stats: dailyStats,
      latency_distribution: latencyDistribution,
      hourly_stats: hourlyStats,
    });
  } catch (err) {
    console.error("[GET /api/analytics] 予期せぬエラー:", err);
    return errorResponse(
      err instanceof Error ? err.message : "予期せぬエラーが発生しました",
      "INTERNAL_SERVER_ERROR",
      500
    );
  }
}
