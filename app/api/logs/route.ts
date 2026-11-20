/**
 * 実行ログ一覧 API
 * GET /api/logs — ワークスペース内の実行ログを返す
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

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agent_id");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30", 10)));
    const offset = (page - 1) * limit;

    // エージェント名も取得するために agents テーブルを結合
    let query = supabase
      .from("execution_logs")
      .select("*, agents!inner(name)", { count: "exact" });

    if (agentId) {
      query = query.eq("agent_id", agentId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: logs, error, count } = await query;

    if (error) {
      console.error("[GET /api/logs] DBエラー:", error);
      return errorResponse(`DBエラー: ${error.message}`, "DB_ERROR", 500);
    }

    return NextResponse.json({
      logs: logs ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[GET /api/logs] 予期せぬエラー:", err);
    return errorResponse(
      err instanceof Error ? err.message : "予期せぬエラーが発生しました",
      "INTERNAL_SERVER_ERROR",
      500
    );
  }
}
