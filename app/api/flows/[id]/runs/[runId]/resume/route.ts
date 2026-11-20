/**
 * フロー実行再開 API (Human-in-the-Loop)
 * POST /api/flows/[id]/runs/[runId]/resume
 *
 * Request body:
 *   input?: string — humanノードへの入力（ユーザーの判断結果）
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { executeFlow } from "@/lib/flow-engine";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { FlowNode, FlowEdge, FlowNodeResult, ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string; runId: string }> };

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: flowId, runId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase || !auth.userId) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const body = await request.json() as { input?: string };
  const serviceSupabase = createServiceRoleClient();

  // 一時停止中の実行を取得
  const { data: flowRun, error: runError } = await auth.supabase
    .from("flow_runs")
    .select("*")
    .eq("id", runId)
    .eq("flow_id", flowId)
    .eq("status", "paused")
    .single();

  if (runError || !flowRun) {
    return NextResponse.json<ApiError>(
      { error: "一時停止中の実行が見つかりません", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  // フローのノード・エッジを取得
  const { data: flow } = await auth.supabase
    .from("flows")
    .select("*, flow_nodes(*), flow_edges(*)")
    .eq("id", flowId)
    .single();

  if (!flow) {
    return NextResponse.json<ApiError>(
      { error: "フローが見つかりません", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const nodes: FlowNode[] = flow.flow_nodes ?? [];
  const edges: FlowEdge[] = flow.flow_edges ?? [];
  const workspaceId = auth.workspaceId ?? flow.workspace_id;
  const previousResults = (flowRun.node_results ?? {}) as Record<string, FlowNodeResult>;

  // humanノードの結果を更新（ユーザーの入力を反映）
  const pausedNodeId = flowRun.paused_at_node_id;
  if (pausedNodeId && previousResults[pausedNodeId]) {
    previousResults[pausedNodeId] = {
      ...previousResults[pausedNodeId],
      status: "success",
      output: body.input ?? previousResults[pausedNodeId].input,
      ended_at: new Date().toISOString(),
    };
  }

  try {
    // 一時停止ノードから再開
    const result = await executeFlow(
      nodes, edges, flowRun.input, workspaceId,
      undefined,
      pausedNodeId ?? undefined,
      previousResults
    );

    // レコード更新
    await serviceSupabase.from("flow_runs").update({
      status: result.status,
      output: result.output,
      node_results: result.nodeResults,
      paused_at_node_id: result.pausedAtNodeId ?? null,
      total_cost_usd: (flowRun.total_cost_usd ?? 0) + result.totalCostUsd,
      total_latency_ms: (flowRun.total_latency_ms ?? 0) + result.totalLatencyMs,
      error_message: result.errorMessage ?? null,
      ended_at: result.status !== "paused" ? new Date().toISOString() : null,
    }).eq("id", runId);

    return NextResponse.json({
      run_id: runId,
      status: result.status,
      output: result.output,
      node_results: result.nodeResults,
      paused_at_node_id: result.pausedAtNodeId,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "再開エラー";
    return NextResponse.json<ApiError>(
      { error: errorMsg, code: "RESUME_ERROR" },
      { status: 500 }
    );
  }
}
