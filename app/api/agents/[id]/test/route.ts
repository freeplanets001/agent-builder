/**
 * エージェントテスト API
 *
 * GET  /api/agents/[id]/test — テストケース一覧
 * POST /api/agents/[id]/test — テストケース作成 or テスト実行
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { getAIProvider, estimateCost } from "@/lib/ai-client";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

/** アサーション評価 */
function evaluateAssertion(
  actual: string,
  expected: string,
  assertionType: string
): boolean {
  switch (assertionType) {
    case "contains":
      return actual.includes(expected);
    case "exact":
      return actual.trim() === expected.trim();
    case "regex":
      return new RegExp(expected).test(actual);
    case "not_contains":
      return !actual.includes(expected);
    case "json_schema":
      try {
        JSON.parse(actual);
        return true;
      } catch {
        return false;
      }
    default:
      return false;
  }
}

// ============================================================
// GET — テストケース一覧
// ============================================================
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: agentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { data: testCases, error } = await auth.supabase
    .from("agent_test_cases")
    .select("*")
    .eq("agent_id", agentId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    return errorResponse(error.message, "DB_ERROR", 500);
  }

  // 最新のテスト実行結果も取得
  const { data: lastRun } = await auth.supabase
    .from("agent_test_runs")
    .select("*")
    .eq("agent_id", agentId)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    test_cases: testCases ?? [],
    last_run: lastRun ?? null,
  });
}

// ============================================================
// POST — テストケース作成 or テスト実行
// ============================================================
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: agentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;
  const body = await request.json() as {
    action: "create" | "run";
    // create 用
    name?: string;
    input?: string;
    expected_output?: string;
    assertion_type?: string;
    // run 用（テスト実行）
    test_case_ids?: string[];
  };

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

  // --- テストケース作成 ---
  if (body.action === "create") {
    if (!body.name || !body.input) {
      return errorResponse("name と input は必須です", "VALIDATION_ERROR", 422);
    }

    const { data: testCase, error } = await supabase
      .from("agent_test_cases")
      .insert({
        agent_id: agentId,
        workspace_id: workspaceId,
        name: body.name,
        input: body.input,
        expected_output: body.expected_output ?? "",
        assertion_type: body.assertion_type ?? "contains",
        created_by: auth.userId,
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, "DB_ERROR", 500);
    return NextResponse.json({ test_case: testCase }, { status: 201 });
  }

  // --- テスト実行 ---
  if (body.action === "run") {
    // エージェント情報を取得
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      return errorResponse("エージェントが見つかりません", "NOT_FOUND", 404);
    }

    // テストケース取得
    let query = supabase
      .from("agent_test_cases")
      .select("*")
      .eq("agent_id", agentId)
      .eq("is_active", true);

    if (body.test_case_ids?.length) {
      query = query.in("id", body.test_case_ids);
    }

    const { data: testCases } = await query;
    if (!testCases?.length) {
      return errorResponse("実行するテストケースがありません", "NO_TEST_CASES", 404);
    }

    // テスト実行レコード作成
    const { data: run, error: runError } = await supabase
      .from("agent_test_runs")
      .insert({
        agent_id: agentId,
        workspace_id: workspaceId,
        status: "running",
        total_cases: testCases.length,
      })
      .select()
      .single();

    if (runError || !run) {
      return errorResponse("テスト実行の作成に失敗しました", "DB_ERROR", 500);
    }

    // プロバイダー取得
    const provider = await getAIProvider(agent.model, workspaceId);

    let passedCount = 0;
    let failedCount = 0;
    let totalLatency = 0;
    let totalCost = 0;
    const results: Array<{
      test_case_id: string;
      name: string;
      status: string;
      actual_output: string;
      latency_ms: number;
      cost_usd: number;
      error_message: string | null;
    }> = [];

    // 各テストケースを順次実行
    for (const tc of testCases) {
      const startedAt = Date.now();
      try {
        const result = await provider.chat({
          model: agent.model,
          systemPrompt: agent.system_prompt,
          messages: [{ role: "user", content: tc.input }],
          temperature: agent.temperature,
          maxTokens: agent.max_tokens,
        });

        const latencyMs = Date.now() - startedAt;
        const costUsd = estimateCost(agent.model, result.inputTokens, result.outputTokens);
        const passed = tc.expected_output
          ? evaluateAssertion(result.output, tc.expected_output, tc.assertion_type)
          : true; // expected_outputが空ならエラーなく実行できればOK

        const status = passed ? "passed" : "failed";
        if (passed) passedCount++; else failedCount++;
        totalLatency += latencyMs;
        totalCost += costUsd;

        // 結果保存
        await supabase.from("agent_test_results").insert({
          run_id: run.id,
          test_case_id: tc.id,
          status,
          actual_output: result.output,
          latency_ms: latencyMs,
          cost_usd: costUsd,
        });

        results.push({
          test_case_id: tc.id,
          name: tc.name,
          status,
          actual_output: result.output.slice(0, 500),
          latency_ms: latencyMs,
          cost_usd: costUsd,
          error_message: null,
        });
      } catch (err) {
        failedCount++;
        const latencyMs = Date.now() - startedAt;
        totalLatency += latencyMs;
        const errorMsg = err instanceof Error ? err.message : "不明なエラー";

        await supabase.from("agent_test_results").insert({
          run_id: run.id,
          test_case_id: tc.id,
          status: "error",
          error_message: errorMsg,
          latency_ms: latencyMs,
        });

        results.push({
          test_case_id: tc.id,
          name: tc.name,
          status: "error",
          actual_output: "",
          latency_ms: latencyMs,
          cost_usd: 0,
          error_message: errorMsg,
        });
      }
    }

    // テスト実行結果を更新
    const runStatus = failedCount === 0 ? "passed" : "failed";
    await supabase.from("agent_test_runs").update({
      status: runStatus,
      passed_cases: passedCount,
      failed_cases: failedCount,
      total_latency_ms: totalLatency,
      total_cost_usd: totalCost,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    return NextResponse.json({
      run_id: run.id,
      status: runStatus,
      total: testCases.length,
      passed: passedCount,
      failed: failedCount,
      total_latency_ms: totalLatency,
      total_cost_usd: totalCost,
      results,
    });
  }

  return errorResponse("action は 'create' または 'run' を指定してください", "VALIDATION_ERROR", 422);
}
