/**
 * エージェント間通信 — パイプライン実行エンジン
 *
 * 複数エージェントを順次実行し、前ステップの出力を次のステップに渡す。
 * テンプレート変数: {{prev_output}}, {{original_input}}, {{step_N_output}}
 */
import { getAIProvider, estimateCost } from "@/lib/ai-client";
import { createServiceRoleClient } from "@/lib/supabase-server";

/** パイプラインステップ定義 */
export interface PipelineStep {
  agent_id: string;
  role?: string; // 例: "researcher", "writer", "reviewer"
  input_template: string; // {{prev_output}} 等のテンプレート
}

/** ステップ実行結果 */
export interface StepResult {
  agent_id: string;
  agent_name: string;
  role: string;
  input: string;
  output: string;
  cost_usd: number;
  latency_ms: number;
}

/** パイプライン実行結果 */
export interface PipelineResult {
  status: "success" | "error";
  output: string | null;
  stepResults: StepResult[];
  totalCostUsd: number;
  totalLatencyMs: number;
  errorMessage?: string;
}

/** コールバック */
export interface PipelineCallback {
  onStepStart: (stepIndex: number, agentName: string, role: string) => void;
  onStepComplete: (stepIndex: number, result: StepResult) => void;
}

/**
 * テンプレート変数を展開する
 */
function expandTemplate(
  template: string,
  context: {
    originalInput: string;
    prevOutput: string;
    stepOutputs: Map<number, string>;
  }
): string {
  let result = template;
  result = result.replace(/\{\{original_input\}\}/g, context.originalInput);
  result = result.replace(/\{\{prev_output\}\}/g, context.prevOutput);

  // {{step_N_output}} パターン
  for (const [stepNum, output] of context.stepOutputs) {
    result = result.replace(new RegExp(`\\{\\{step_${stepNum}_output\\}\\}`, "g"), output);
  }

  return result;
}

/**
 * パイプラインを実行する
 */
export async function executePipeline(
  steps: PipelineStep[],
  input: string,
  workspaceId: string,
  callbacks?: Partial<PipelineCallback>
): Promise<PipelineResult> {
  const supabase = createServiceRoleClient();
  const stepResults: StepResult[] = [];
  const stepOutputs = new Map<number, string>();
  let prevOutput = input;
  let totalCostUsd = 0;
  let totalLatencyMs = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // エージェント情報を取得
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, model, system_prompt, temperature, max_tokens")
      .eq("id", step.agent_id)
      .single();

    if (!agent) {
      return {
        status: "error",
        output: null,
        stepResults,
        totalCostUsd,
        totalLatencyMs,
        errorMessage: `ステップ${i + 1}: エージェント ${step.agent_id} が見つかりません`,
      };
    }

    const role = step.role ?? `step_${i + 1}`;
    callbacks?.onStepStart?.(i, agent.name, role);

    // テンプレート展開
    const expandedInput = expandTemplate(step.input_template, {
      originalInput: input,
      prevOutput,
      stepOutputs,
    });

    const startTime = Date.now();

    try {
      const provider = await getAIProvider(agent.model, workspaceId);
      const result = await provider.chat({
        model: agent.model,
        maxTokens: agent.max_tokens,
        systemPrompt: agent.system_prompt,
        temperature: agent.temperature,
        messages: [{ role: "user", content: expandedInput }],
      });

      const latencyMs = Date.now() - startTime;
      const costUsd = estimateCost(agent.model, result.inputTokens, result.outputTokens);

      const stepResult: StepResult = {
        agent_id: agent.id,
        agent_name: agent.name,
        role,
        input: expandedInput,
        output: result.output,
        cost_usd: costUsd,
        latency_ms: latencyMs,
      };

      stepResults.push(stepResult);
      stepOutputs.set(i + 1, result.output);
      prevOutput = result.output;
      totalCostUsd += costUsd;
      totalLatencyMs += latencyMs;

      callbacks?.onStepComplete?.(i, stepResult);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "不明なエラー";
      return {
        status: "error",
        output: null,
        stepResults,
        totalCostUsd,
        totalLatencyMs,
        errorMessage: `ステップ${i + 1} (${agent.name}): ${errorMsg}`,
      };
    }
  }

  return {
    status: "success",
    output: prevOutput,
    stepResults,
    totalCostUsd,
    totalLatencyMs,
  };
}
