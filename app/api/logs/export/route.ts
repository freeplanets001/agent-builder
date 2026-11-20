/**
 * ログエクスポート API
 * GET /api/logs/export?format=csv|json
 *
 * 実行ログをCSVまたはJSONでダウンロードする。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

/** CSVセーフなエスケープ */
function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** 最大エクスポート行数 */
const MAX_EXPORT_ROWS = 10000;

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "csv";
  const agentId = searchParams.get("agent_id");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (format !== "csv" && format !== "json") {
    return errorResponse("format は csv または json を指定してください", "VALIDATION_ERROR", 422);
  }

  // クエリ構築
  let query = auth.supabase
    .from("execution_logs")
    .select("id, status, input, output, model, input_tokens, output_tokens, cost_usd, latency_ms, created_at, agents(name)")
    .order("created_at", { ascending: false })
    .limit(MAX_EXPORT_ROWS);

  if (agentId) query = query.eq("agent_id", agentId);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const { data: logs, error } = await query;

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  const rows = (logs ?? []).map((log) => ({
    id: log.id,
    agent_name: (log.agents as unknown as { name: string } | null)?.name ?? "",
    status: log.status,
    input: log.input ?? "",
    output: log.output ?? "",
    model: log.model ?? "",
    input_tokens: log.input_tokens ?? 0,
    output_tokens: log.output_tokens ?? 0,
    cost_usd: log.cost_usd ?? 0,
    latency_ms: log.latency_ms ?? 0,
    created_at: log.created_at,
  }));

  if (format === "json") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new Response(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="logs-${timestamp}.json"`,
      },
    });
  }

  // CSV
  const headers = ["id", "agent_name", "status", "input", "output", "model", "input_tokens", "output_tokens", "cost_usd", "latency_ms", "created_at"];
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeCsv(row[h as keyof typeof row])).join(",")
    ),
  ];

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new Response(csvLines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="logs-${timestamp}.csv"`,
    },
  });
}
