/**
 * エージェント評価 API
 * POST /api/agents/[id]/evaluate — 評価実行
 * GET  /api/agents/[id]/evaluate — 評価実行履歴
 *
 * POST body:
 *   suite_id: string — テストスイートID
 *   model_override?: string — モデル上書き（A/Bテスト用）
 *   prompt_override?: string — プロンプト上書き（A/Bテスト用）
 *   label?: string — ラベル（"A", "B"等）
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { runEvaluation } from "@/lib/evaluation/evaluator";
import type { EvalCase } from "@/lib/evaluation/evaluator";
import type { EvalCriteria } from "@/lib/evaluation/scorers";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

/** 評価実行 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: agentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase || !auth.userId) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const body = await request.json() as {
    suite_id: string;
    model_override?: string;
    prompt_override?: string;
    label?: string;
  };

  if (!body.suite_id) {
    return NextResponse.json<ApiError>(
      { error: "suite_idは必須です", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  // エージェント取得
  const { data: agent } = await auth.supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (!agent) {
    return NextResponse.json<ApiError>(
      { error: "エージェントが見つかりません", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  // テストケースを取得
  const { data: cases, error: casesError } = await auth.supabase
    .from("eval_cases")
    .select("id, input, expected_output, eval_criteria")
    .eq("suite_id", body.suite_id)
    .order("sort_order");

  if (casesError || !cases || cases.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "テストケースが見つかりません", code: "NO_CASES" },
      { status: 404 }
    );
  }

  const workspaceId = auth.workspaceId ?? agent.workspace_id;
  const serviceSupabase = createServiceRoleClient();

  // 評価実行レコード作成
  const { data: evalRun } = await serviceSupabase
    .from("eval_runs")
    .insert({
      suite_id: body.suite_id,
      agent_id: agentId,
      workspace_id: workspaceId,
      agent_version: agent.version,
      model_override: body.model_override ?? null,
      prompt_override: body.prompt_override ?? null,
      label: body.label ?? null,
      status: "running",
      total_cases: cases.length,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  const runId = evalRun?.id;

  try {
    // 評価実行
    const evalResult = await runEvaluation(
      cases.map((c) => ({
        id: c.id,
        input: c.input,
        expected_output: c.expected_output,
        eval_criteria: (c.eval_criteria ?? { type: "contains" }) as EvalCriteria,
      })) as EvalCase[],
      {
        agentId,
        workspaceId,
        model: body.model_override ?? agent.model,
        systemPrompt: body.prompt_override ?? agent.system_prompt,
        temperature: agent.temperature,
        maxTokens: agent.max_tokens,
      }
    );

    // 結果を保存
    if (runId) {
      await serviceSupabase.from("eval_runs").update({
        status: "success",
        passed_cases: evalResult.passedCases,
        avg_score: evalResult.avgScore,
        total_cost_usd: evalResult.totalCostUsd,
        total_latency_ms: evalResult.totalLatencyMs,
        results: evalResult.results,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return NextResponse.json({
      run_id: runId,
      ...evalResult,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "評価実行エラー";
    if (runId) {
      await serviceSupabase.from("eval_runs").update({
        status: "error",
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return NextResponse.json<ApiError>(
      { error: errorMsg, code: "EVAL_ERROR" },
      { status: 500 }
    );
  }
}

/** 評価実行履歴 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: agentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { data: runs, error } = await auth.supabase
    .from("eval_runs")
    .select("id, suite_id, agent_version, model_override, label, status, total_cases, passed_cases, avg_score, total_cost_usd, total_latency_ms, created_at, completed_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json<ApiError>(
      { error: `取得エラー: ${error.message}`, code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ runs: runs ?? [] });
}
