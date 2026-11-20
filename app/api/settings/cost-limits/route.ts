/**
 * コスト上限設定 API
 * GET  /api/settings/cost-limits — 現在の設定取得
 * PUT  /api/settings/cost-limits — 設定更新
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { checkCostLimit } from "@/lib/cost-guard";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  let workspaceId = auth.workspaceId;
  if (!workspaceId) {
    const { data: member } = await auth.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", auth.userId!)
      .limit(1)
      .single();
    workspaceId = member?.workspace_id ?? null;
  }
  if (!workspaceId) return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);

  const costStatus = await checkCostLimit(workspaceId);

  const { data: settings } = await auth.supabase
    .from("workspace_cost_limits")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  return NextResponse.json({ settings: settings ?? null, status: costStatus });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  let workspaceId = auth.workspaceId;
  if (!workspaceId) {
    const { data: member } = await auth.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", auth.userId!)
      .limit(1)
      .single();
    workspaceId = member?.workspace_id ?? null;
  }
  if (!workspaceId) return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);

  const body = await request.json() as {
    monthly_limit_usd?: number;
    alert_threshold_percent?: number;
    is_hard_limit?: boolean;
  };

  const { data, error } = await auth.supabase
    .from("workspace_cost_limits")
    .upsert({
      workspace_id: workspaceId,
      monthly_limit_usd: body.monthly_limit_usd ?? 10,
      alert_threshold_percent: body.alert_threshold_percent ?? 80,
      is_hard_limit: body.is_hard_limit ?? false,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  return NextResponse.json({ settings: data });
}
