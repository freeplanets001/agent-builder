/**
 * パイプライン CRUD + 実行 API
 * GET  /api/pipelines — 一覧
 * POST /api/pipelines — 作成 or 実行
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { executePipeline } from "@/lib/agent-communication";
import type { PipelineStep } from "@/lib/agent-communication";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { ApiError } from "@/lib/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { data, error } = await auth.supabase
    .from("agent_pipelines")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json<ApiError>(
      { error: error.message, code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ pipelines: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase || !auth.userId) {
    return NextResponse.json<ApiError>(
      { error: "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const body = await request.json() as {
    // 作成モード
    name?: string;
    description?: string;
    steps?: PipelineStep[];
    // 実行モード
    pipeline_id?: string;
    input?: string;
  };

  // 実行モード
  if (body.pipeline_id && body.input) {
    const { data: pipeline } = await auth.supabase
      .from("agent_pipelines")
      .select("*")
      .eq("id", body.pipeline_id)
      .single();

    if (!pipeline) {
      return NextResponse.json<ApiError>(
        { error: "パイプラインが見つかりません", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const workspaceId = auth.workspaceId ?? pipeline.workspace_id;
    const steps = pipeline.steps as PipelineStep[];
    const serviceSupabase = createServiceRoleClient();

    // 実行レコード作成
    const { data: run } = await serviceSupabase
      .from("pipeline_runs")
      .insert({
        pipeline_id: body.pipeline_id,
        workspace_id: workspaceId,
        user_id: auth.userId,
        input: body.input,
        status: "running",
      })
      .select("id")
      .single();

    try {
      const result = await executePipeline(steps, body.input, workspaceId);

      if (run?.id) {
        await serviceSupabase.from("pipeline_runs").update({
          status: result.status,
          output: result.output,
          step_results: result.stepResults,
          total_cost_usd: result.totalCostUsd,
          total_latency_ms: result.totalLatencyMs,
          error_message: result.errorMessage ?? null,
          completed_at: new Date().toISOString(),
        }).eq("id", run.id);
      }

      return NextResponse.json({ run_id: run?.id, ...result });
    } catch (err) {
      return NextResponse.json<ApiError>(
        { error: err instanceof Error ? err.message : "パイプライン実行エラー", code: "PIPELINE_ERROR" },
        { status: 500 }
      );
    }
  }

  // 作成モード
  if (!body.name?.trim() || !body.steps?.length) {
    return NextResponse.json<ApiError>(
      { error: "name と steps は必須です", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  // ワークスペースID取得
  const { data: member } = await auth.supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", auth.userId)
    .limit(1)
    .single();

  if (!member) {
    return NextResponse.json<ApiError>(
      { error: "ワークスペースが見つかりません", code: "NO_WORKSPACE" },
      { status: 404 }
    );
  }

  const { data: pipeline, error: createError } = await auth.supabase
    .from("agent_pipelines")
    .insert({
      workspace_id: member.workspace_id,
      name: body.name.trim(),
      description: body.description ?? null,
      steps: body.steps,
      created_by: auth.userId,
    })
    .select("*")
    .single();

  if (createError) {
    return NextResponse.json<ApiError>(
      { error: createError.message, code: "DB_ERROR" },
      { status: 500 }
    );
  }

  return NextResponse.json({ pipeline }, { status: 201 });
}
