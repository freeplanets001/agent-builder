/**
 * エージェント連鎖 (パイプライン) API
 * POST /api/agents/pipeline
 *
 * 複数エージェントを順次実行し、前のエージェントの出力を次の入力にする。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { getAIProvider, estimateCost } from "@/lib/ai-client";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

interface PipelineStep {
  agent_id: string;
  input?: string; // 省略時は前のステップの出力を使用
}

interface StepResult {
  agent_id: string;
  agent_name: string;
  input: string;
  output: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
}

/** 最大連鎖数 */
const MAX_STEPS = 10;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;
  const body = await request.json() as {
    steps?: PipelineStep[];
    initial_input?: string;
  };

  if (!body.steps?.length) {
    return errorResponse("steps は1つ以上必要です", "VALIDATION_ERROR", 422);
  }
  if (body.steps.length > MAX_STEPS) {
    return errorResponse(`最大${MAX_STEPS}ステップまでです`, "VALIDATION_ERROR", 422);
  }

  // ワークスペースID取得
  let workspaceId = auth.workspaceId;
  if (!workspaceId) {
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", auth.userId!)
      .limit(1)
      .single();
    workspaceId = member?.workspace_id ?? null;
  }
  if (!workspaceId) return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);

  const results: StepResult[] = [];
  let currentInput = body.initial_input ?? "";
  let totalCost = 0;

  for (let i = 0; i < body.steps.length; i++) {
    const step = body.steps[i];
    const stepStart = Date.now();

    // エージェント情報を取得
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, system_prompt, model, temperature, max_tokens")
      .eq("id", step.agent_id)
      .single();

    if (agentErr || !agent) {
      return errorResponse(
        `ステップ${i + 1}: エージェント ${step.agent_id} が見つかりません`,
        "NOT_FOUND",
        404
      );
    }

    // 入力の決定: 明示指定 > 前ステップの出力
    const input = step.input ?? currentInput;
    if (!input.trim()) {
      return errorResponse(
        `ステップ${i + 1}: 入力が空です。initial_input または step.input を指定してください`,
        "VALIDATION_ERROR",
        422
      );
    }

    // エージェント実行
    try {
      const provider = await getAIProvider(agent.model, workspaceId);
      const result = await provider.chat({
        model: agent.model,
        systemPrompt: agent.system_prompt,
        messages: [{ role: "user", content: input }],
        temperature: agent.temperature,
        maxTokens: agent.max_tokens,
      });

      const costUsd = estimateCost(agent.model, result.inputTokens, result.outputTokens);
      const latencyMs = Date.now() - stepStart;
      totalCost += costUsd;

      const stepResult: StepResult = {
        agent_id: agent.id,
        agent_name: agent.name,
        input,
        output: result.output,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_usd: costUsd,
        latency_ms: latencyMs,
      };

      results.push(stepResult);
      currentInput = result.output; // 次のステップの入力にする
    } catch (err) {
      return errorResponse(
        `ステップ${i + 1} (${agent.name}): ${err instanceof Error ? err.message : "実行エラー"}`,
        "PIPELINE_ERROR",
        500
      );
    }
  }

  return NextResponse.json({
    total_steps: results.length,
    total_latency_ms: Date.now() - startedAt,
    total_cost_usd: totalCost,
    final_output: currentInput,
    results,
  });
}
