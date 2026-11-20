/**
 * テストスイート CRUD API
 * GET  /api/agents/[id]/evaluate/suites — スイート一覧
 * POST /api/agents/[id]/evaluate/suites — スイート作成（ケース含む）
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

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

  const { data, error } = await auth.supabase
    .from("eval_suites")
    .select("*, eval_cases(count)")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json<ApiError>(
      { error: `取得エラー: ${error.message}`, code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ suites: data ?? [] });
}

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
    name: string;
    description?: string;
    cases: Array<{
      input: string;
      expected_output?: string;
      eval_criteria?: Record<string, unknown>;
      tags?: string[];
    }>;
  };

  if (!body.name?.trim()) {
    return NextResponse.json<ApiError>(
      { error: "スイート名は必須です", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  // ワークスペースID取得
  const { data: agent } = await auth.supabase
    .from("agents")
    .select("workspace_id")
    .eq("id", agentId)
    .single();

  if (!agent) {
    return NextResponse.json<ApiError>(
      { error: "エージェントが見つかりません", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  // スイート作成
  const { data: suite, error: suiteError } = await auth.supabase
    .from("eval_suites")
    .insert({
      agent_id: agentId,
      workspace_id: agent.workspace_id,
      name: body.name.trim(),
      description: body.description ?? null,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (suiteError || !suite) {
    return NextResponse.json<ApiError>(
      { error: `スイート作成エラー: ${suiteError?.message}`, code: "DB_ERROR" },
      { status: 500 }
    );
  }

  // テストケース作成
  if (body.cases && body.cases.length > 0) {
    const casesData = body.cases.map((c, i) => ({
      suite_id: suite.id,
      input: c.input,
      expected_output: c.expected_output ?? null,
      eval_criteria: c.eval_criteria ?? {},
      tags: c.tags ?? [],
      sort_order: i,
    }));

    await auth.supabase.from("eval_cases").insert(casesData);
  }

  return NextResponse.json({
    suite: { id: suite.id, name: body.name, case_count: body.cases?.length ?? 0 },
  }, { status: 201 });
}
