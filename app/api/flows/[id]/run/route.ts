/**
 * フロー実行 API（SSEストリーミング対応）
 * POST /api/flows/[id]/run
 *
 * Request body:
 *   input: string — ユーザー入力
 *   stream?: boolean — ストリーミング有効フラグ（default: true）
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { executeFlow } from "@/lib/flow-engine";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { FlowNode, FlowEdge, FlowNodeResult, StreamEvent, ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

const encoder = new TextEncoder();
function encodeSSE(event: StreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse | Response> {
  const { id: flowId } = await params;
  const startedAt = Date.now();

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase || !auth.userId) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const body = await request.json() as { input: string; stream?: boolean };
  if (!body.input?.trim()) {
    return NextResponse.json<ApiError>(
      { error: "入力は必須です", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  // フロー + ノード + エッジを取得
  const { data: flow, error: flowError } = await auth.supabase
    .from("flows")
    .select("*, flow_nodes(*), flow_edges(*)")
    .eq("id", flowId)
    .single();

  if (flowError || !flow) {
    return NextResponse.json<ApiError>(
      { error: "フローが見つかりません", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const nodes: FlowNode[] = flow.flow_nodes ?? [];
  const edges: FlowEdge[] = flow.flow_edges ?? [];

  if (nodes.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "フローにノードがありません", code: "EMPTY_FLOW" },
      { status: 400 }
    );
  }

  const workspaceId = auth.workspaceId ?? flow.workspace_id;
  const serviceSupabase = createServiceRoleClient();

  // フロー実行レコードを作成
  const { data: flowRun } = await serviceSupabase
    .from("flow_runs")
    .insert({
      flow_id: flowId,
      workspace_id: workspaceId,
      user_id: auth.userId,
      status: "running",
      input: body.input,
    })
    .select("id")
    .single();

  const runId = flowRun?.id;
  const useStream = body.stream !== false;

  if (useStream) {
    // SSEストリーミング
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await executeFlow(
            nodes, edges, body.input, workspaceId,
            {
              onNodeStart: (nodeId, nodeType) => {
                controller.enqueue(encodeSSE({
                  type: "tool_use" as StreamEvent["type"],
                  tool_name: `node:${nodeType}`,
                  tool_input: { node_id: nodeId },
                }));
              },
              onNodeComplete: (nodeId, nodeResult) => {
                controller.enqueue(encodeSSE({
                  type: "tool_result" as StreamEvent["type"],
                  tool_name: `node:${nodeResult.node_type}`,
                  tool_result: {
                    node_id: nodeId,
                    status: nodeResult.status,
                    output: nodeResult.output?.slice(0, 500),
                    cost_usd: nodeResult.cost_usd,
                  },
                }));
              },
              onNodeError: (nodeId, error) => {
                controller.enqueue(encodeSSE({
                  type: "error",
                  error: `ノード ${nodeId} でエラー: ${error}`,
                }));
              },
              onPause: (nodeId) => {
                controller.enqueue(encodeSSE({
                  type: "tool_result" as StreamEvent["type"],
                  tool_name: "human_pause",
                  tool_result: { node_id: nodeId, status: "paused" },
                }));
              },
            }
          );

          // 完了イベント
          controller.enqueue(encodeSSE({
            type: "done",
            content: result.output ?? "",
            usage: {
              input_tokens: 0,
              output_tokens: 0,
              cost_usd: result.totalCostUsd,
            },
          }));

          // フロー実行レコード更新
          if (runId) {
            await serviceSupabase.from("flow_runs").update({
              status: result.status,
              output: result.output,
              node_results: result.nodeResults,
              paused_at_node_id: result.pausedAtNodeId ?? null,
              total_cost_usd: result.totalCostUsd,
              total_latency_ms: Date.now() - startedAt,
              error_message: result.errorMessage ?? null,
              ended_at: new Date().toISOString(),
            }).eq("id", runId);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "フロー実行エラー";
          controller.enqueue(encodeSSE({ type: "error", error: errorMsg }));

          if (runId) {
            await serviceSupabase.from("flow_runs").update({
              status: "error",
              error_message: errorMsg,
              total_latency_ms: Date.now() - startedAt,
              ended_at: new Date().toISOString(),
            }).eq("id", runId);
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Flow-Run-Id": runId ?? "",
      },
    });
  }

  // 非ストリーミング
  try {
    const result = await executeFlow(nodes, edges, body.input, workspaceId);

    if (runId) {
      await serviceSupabase.from("flow_runs").update({
        status: result.status,
        output: result.output,
        node_results: result.nodeResults,
        paused_at_node_id: result.pausedAtNodeId ?? null,
        total_cost_usd: result.totalCostUsd,
        total_latency_ms: Date.now() - startedAt,
        ended_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return NextResponse.json({
      run_id: runId,
      status: result.status,
      output: result.output,
      node_results: result.nodeResults,
      total_cost_usd: result.totalCostUsd,
      total_latency_ms: Date.now() - startedAt,
      paused_at_node_id: result.pausedAtNodeId,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "フロー実行エラー";
    return NextResponse.json<ApiError>(
      { error: errorMsg, code: "FLOW_EXECUTION_ERROR" },
      { status: 500 }
    );
  }
}
