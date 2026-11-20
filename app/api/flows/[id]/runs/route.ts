/**
 * フロー実行履歴 API
 * GET /api/flows/[id]/runs — 実行履歴一覧
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: flowId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "20"), 100);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0");

  const { data, count, error } = await auth.supabase
    .from("flow_runs")
    .select("id, flow_id, status, input, output, total_cost_usd, total_latency_ms, error_message, started_at, ended_at, created_at", { count: "exact" })
    .eq("flow_id", flowId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json<ApiError>(
      { error: `取得エラー: ${error.message}`, code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ runs: data ?? [], total: count ?? 0, limit, offset });
}
