/**
 * 評価実行エンジン
 *
 * テストスイートのケースを順次実行し、スコアリングする。
 * A/Bテスト対応: 同じテストケースを異なる設定で並列実行。
 */
import { getAIProvider, estimateCost } from "@/lib/ai-client";
import { evaluateOutput } from "./scorers";
import type { EvalCriteria } from "./scorers";

/** テストケース */
export interface EvalCase {
  id: string;
  input: string;
  expected_output: string | null;
  eval_criteria: EvalCriteria;
}

/** 個別結果 */
export interface CaseResult {
  case_id: string;
  input: string;
  expected: string | null;
  actual: string;
  score: number;
  passed: boolean;
  reason: string;
  latency_ms: number;
  cost_usd: number;
}

/** 評価実行設定 */
export interface EvalConfig {
  agentId: string;
  workspaceId: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

/** 評価結果 */
export interface EvalResult {
  totalCases: number;
  passedCases: number;
  avgScore: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  results: CaseResult[];
}

/**
 * テストスイートを実行する
 */
export async function runEvaluation(
  cases: EvalCase[],
  config: EvalConfig,
  onProgress?: (completed: number, total: number) => void
): Promise<EvalResult> {
  const results: CaseResult[] = [];
  let totalCostUsd = 0;
  let totalLatencyMs = 0;

  const provider = await getAIProvider(config.model, config.workspaceId);

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const startTime = Date.now();

    try {
      // エージェント実行
      const response = await provider.chat({
        model: config.model,
        maxTokens: config.maxTokens,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        messages: [{ role: "user", content: testCase.input }],
      });

      const latencyMs = Date.now() - startTime;
      const costUsd = estimateCost(config.model, response.inputTokens, response.outputTokens);

      // スコアリング
      const criteria: EvalCriteria = testCase.eval_criteria?.type
        ? testCase.eval_criteria
        : { type: testCase.expected_output ? "contains" : "ai_judge" };

      const scoreResult = await evaluateOutput(
        response.output,
        testCase.expected_output,
        testCase.input,
        criteria,
        config.workspaceId
      );

      results.push({
        case_id: testCase.id,
        input: testCase.input,
        expected: testCase.expected_output,
        actual: response.output,
        score: scoreResult.score,
        passed: scoreResult.passed,
        reason: scoreResult.reason,
        latency_ms: latencyMs,
        cost_usd: costUsd,
      });

      totalCostUsd += costUsd;
      totalLatencyMs += latencyMs;
    } catch (err) {
      results.push({
        case_id: testCase.id,
        input: testCase.input,
        expected: testCase.expected_output,
        actual: "",
        score: 0,
        passed: false,
        reason: `実行エラー: ${err instanceof Error ? err.message : "不明"}`,
        latency_ms: Date.now() - startTime,
        cost_usd: 0,
      });
    }

    onProgress?.(i + 1, cases.length);
  }

  const passedCases = results.filter((r) => r.passed).length;
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.score, 0) / results.length
    : 0;

  return {
    totalCases: results.length,
    passedCases,
    avgScore,
    totalCostUsd,
    totalLatencyMs,
    results,
  };
}

/**
 * A/Bテスト: 2つの設定で同じテストケースを実行して比較
 */
export async function runABTest(
  cases: EvalCase[],
  configA: EvalConfig,
  configB: EvalConfig,
): Promise<{ a: EvalResult; b: EvalResult }> {
  const [resultA, resultB] = await Promise.all([
    runEvaluation(cases, configA),
    runEvaluation(cases, configB),
  ]);

  return { a: resultA, b: resultB };
}
