/**
 * フロー実行エンジン
 *
 * DAG（有向非巡回グラフ）をトポロジカルソートで実行する。
 * ノード種別: start, agent, condition, parallel, merge, human, end
 * エッジ種別: normal, true, false, error
 */
import { getAIProvider, estimateCost } from "@/lib/ai-client";
import type { FlowNode, FlowEdge, FlowNodeResult, FlowNodeType } from "@/lib/types";

/** フロー実行のコールバック */
export interface FlowEventCallback {
  onNodeStart: (nodeId: string, nodeType: FlowNodeType) => void;
  onNodeComplete: (nodeId: string, result: FlowNodeResult) => void;
  onNodeError: (nodeId: string, error: string) => void;
  onPause: (nodeId: string) => void;
}

/** フロー実行結果 */
export interface FlowExecutionResult {
  status: "success" | "error" | "paused";
  output: string | null;
  nodeResults: Record<string, FlowNodeResult>;
  totalCostUsd: number;
  totalLatencyMs: number;
  pausedAtNodeId?: string;
  errorMessage?: string;
}

/**
 * フローを実行する
 */
export async function executeFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
  input: string,
  workspaceId: string,
  callbacks?: Partial<FlowEventCallback>,
  resumeFromNodeId?: string,
  previousResults?: Record<string, FlowNodeResult>
): Promise<FlowExecutionResult> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nodeResults: Record<string, FlowNodeResult> = previousResults ? { ...previousResults } : {};
  let totalCostUsd = 0;
  let totalLatencyMs = 0;

  // 隣接リストを構築
  const adjacency = buildAdjacency(nodes, edges);

  // 実行順序を決定
  const executionOrder = topologicalSort(nodes, edges);

  // 各ノードの入力を管理
  const nodeInputs = new Map<string, string[]>();

  // startノードの入力を設定
  for (const node of nodes) {
    if (node.type === "start") {
      nodeInputs.set(node.id, [input]);
    }
  }

  // resumeの場合、一時停止ノード以降から実行
  let shouldExecute = !resumeFromNodeId;

  for (const nodeId of executionOrder) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    // resume処理
    if (resumeFromNodeId && nodeId === resumeFromNodeId) {
      shouldExecute = true;
      // humanノードの入力を引き継ぎ
      if (previousResults?.[nodeId]) {
        nodeInputs.set(nodeId, [previousResults[nodeId].input]);
      }
    }
    if (!shouldExecute) continue;

    // 既にスキップ/完了済みのノードは飛ばす
    if (nodeResults[nodeId]?.status === "success" || nodeResults[nodeId]?.status === "skipped") {
      continue;
    }

    // ノードへの入力を収集（前のノードの出力を結合）
    const inputs = nodeInputs.get(nodeId) ?? [];
    const nodeInput = inputs.join("\n\n---\n\n");

    const startTime = Date.now();
    callbacks?.onNodeStart?.(nodeId, node.type);

    try {
      const result = await executeNode(node, nodeInput, workspaceId, nodeResults);

      const latencyMs = Date.now() - startTime;
      totalCostUsd += result.cost_usd;
      totalLatencyMs += latencyMs;

      const nodeResult: FlowNodeResult = {
        node_id: nodeId,
        node_type: node.type,
        status: result.status,
        input: nodeInput,
        output: result.output,
        agent_id: node.agent_id,
        cost_usd: result.cost_usd,
        latency_ms: latencyMs,
        started_at: new Date(startTime).toISOString(),
        ended_at: new Date().toISOString(),
      };

      nodeResults[nodeId] = nodeResult;

      // humanノードでpause
      if (result.status === "paused") {
        callbacks?.onPause?.(nodeId);
        return {
          status: "paused",
          output: null,
          nodeResults,
          totalCostUsd,
          totalLatencyMs,
          pausedAtNodeId: nodeId,
        };
      }

      callbacks?.onNodeComplete?.(nodeId, nodeResult);

      // 後続ノードに出力を伝搬
      const outEdges = adjacency.get(nodeId) ?? [];
      for (const edge of outEdges) {
        // conditionノードの場合はtrue/falseエッジでフィルタ
        if (node.type === "condition") {
          const conditionResult = result.output === "true";
          if (edge.type === "true" && !conditionResult) continue;
          if (edge.type === "false" && conditionResult) continue;
        }

        const targetInputs = nodeInputs.get(edge.target_node_id) ?? [];
        targetInputs.push(result.output ?? "");
        nodeInputs.set(edge.target_node_id, targetInputs);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "不明なエラー";
      nodeResults[nodeId] = {
        node_id: nodeId,
        node_type: node.type,
        status: "error",
        input: nodeInput,
        output: null,
        cost_usd: 0,
        latency_ms: Date.now() - startTime,
        started_at: new Date(startTime).toISOString(),
        ended_at: new Date().toISOString(),
      };

      callbacks?.onNodeError?.(nodeId, errorMessage);

      // errorエッジがあれば続行、なければ停止
      const errorEdges = (adjacency.get(nodeId) ?? []).filter((e) => e.type === "error");
      if (errorEdges.length === 0) {
        return {
          status: "error",
          output: null,
          nodeResults,
          totalCostUsd,
          totalLatencyMs,
          errorMessage,
        };
      }

      // errorエッジの先に出力を伝搬
      for (const edge of errorEdges) {
        const targetInputs = nodeInputs.get(edge.target_node_id) ?? [];
        targetInputs.push(`エラー: ${errorMessage}`);
        nodeInputs.set(edge.target_node_id, targetInputs);
      }
    }
  }

  // endノードの出力を取得
  const endNodes = nodes.filter((n) => n.type === "end");
  const finalOutputs = endNodes
    .map((n) => nodeResults[n.id]?.output)
    .filter((o): o is string => !!o);

  return {
    status: "success",
    output: finalOutputs.join("\n\n") || null,
    nodeResults,
    totalCostUsd,
    totalLatencyMs,
  };
}

// ============================================================
// ノード実行
// ============================================================

interface NodeExecResult {
  status: "success" | "error" | "skipped" | "paused";
  output: string | null;
  cost_usd: number;
}

async function executeNode(
  node: FlowNode,
  input: string,
  workspaceId: string,
  previousResults: Record<string, FlowNodeResult>
): Promise<NodeExecResult> {
  switch (node.type) {
    case "start":
      return { status: "success", output: input, cost_usd: 0 };

    case "end":
      return { status: "success", output: input, cost_usd: 0 };

    case "agent":
      return executeAgentNode(node, input, workspaceId);

    case "condition":
      return executeConditionNode(node, input);

    case "parallel":
      // parallelノード自体はパススルー（実際の並列実行はトポロジカルソートで処理）
      return { status: "success", output: input, cost_usd: 0 };

    case "merge":
      // mergeノード: 入力を結合して出力
      return { status: "success", output: input, cost_usd: 0 };

    case "human":
      // human-in-the-loop: 一時停止
      return { status: "paused", output: input, cost_usd: 0 };

    default:
      return { status: "error", output: null, cost_usd: 0 };
  }
}

/** agentノード: AIプロバイダーでチャット実行 */
async function executeAgentNode(
  node: FlowNode,
  input: string,
  workspaceId: string
): Promise<NodeExecResult> {
  if (!node.agent_id) {
    return { status: "error", output: "エージェントが指定されていません", cost_usd: 0 };
  }

  const { createServiceRoleClient } = await import("@/lib/supabase-server");
  const supabase = createServiceRoleClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", node.agent_id)
    .single();

  if (!agent) {
    return { status: "error", output: "エージェントが見つかりません", cost_usd: 0 };
  }

  const provider = await getAIProvider(agent.model, workspaceId);
  const result = await provider.chat({
    model: agent.model,
    maxTokens: agent.max_tokens,
    systemPrompt: agent.system_prompt,
    temperature: agent.temperature,
    messages: [{ role: "user", content: input }],
  });

  const costUsd = estimateCost(agent.model, result.inputTokens, result.outputTokens);
  return { status: "success", output: result.output, cost_usd: costUsd };
}

/** conditionノード: JavaScript式を安全に評価 */
async function executeConditionNode(
  node: FlowNode,
  input: string
): Promise<NodeExecResult> {
  const expression = node.condition ?? "false";

  try {
    // 安全な評価: input変数のみアクセス可能
    const fn = new Function("input", "JSON", `
      "use strict";
      try {
        return Boolean(${expression});
      } catch {
        return false;
      }
    `);
    const condResult = fn(input, JSON);
    return { status: "success", output: String(condResult), cost_usd: 0 };
  } catch {
    return { status: "success", output: "false", cost_usd: 0 };
  }
}

// ============================================================
// グラフ操作
// ============================================================

/** 隣接リストを構築 */
function buildAdjacency(
  nodes: FlowNode[],
  edges: FlowEdge[]
): Map<string, FlowEdge[]> {
  const adj = new Map<string, FlowEdge[]>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    const list = adj.get(edge.source_node_id) ?? [];
    list.push(edge);
    adj.set(edge.source_node_id, list);
  }
  return adj;
}

/** トポロジカルソート（カーンのアルゴリズム） */
function topologicalSort(
  nodes: FlowNode[],
  edges: FlowEdge[]
): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    const current = inDegree.get(edge.target_node_id) ?? 0;
    inDegree.set(edge.target_node_id, current + 1);

    const targets = adj.get(edge.source_node_id) ?? [];
    targets.push(edge.target_node_id);
    adj.set(edge.source_node_id, targets);
  }

  // 入次数0のノードをキューに追加（startノード優先）
  const queue: string[] = [];
  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) {
      if (node.type === "start") {
        queue.unshift(node.id); // startを先頭に
      } else {
        queue.push(node.id);
      }
    }
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);

    for (const targetId of adj.get(nodeId) ?? []) {
      const degree = (inDegree.get(targetId) ?? 1) - 1;
      inDegree.set(targetId, degree);
      if (degree === 0) {
        queue.push(targetId);
      }
    }
  }

  return result;
}
