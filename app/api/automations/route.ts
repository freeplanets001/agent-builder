/**
 * 自動化ルール CRUD API
 * GET  /api/automations  — 一覧取得
 * POST /api/automations  — 新規作成
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { ApiError } from "@/lib/types";
import crypto from "crypto";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse("認証が必要です", "UNAUTHORIZED", 401);

    const { searchParams } = new URL(request.url);
    const triggerType = searchParams.get("trigger_type");

    let query = supabase
      .from("automations")
      .select("*, agents(name)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (triggerType) {
      query = query.eq("trigger_type", triggerType);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[GET /api/automations] DBエラー:", error);
      return errorResponse(`DBエラー: ${error.message}`, "DB_ERROR", 500);
    }

    return NextResponse.json({ automations: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[GET /api/automations]:", err);
    return errorResponse(err instanceof Error ? err.message : "予期せぬエラー", "INTERNAL_SERVER_ERROR", 500);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse("認証が必要です", "UNAUTHORIZED", 401);

    const body = await request.json() as {
      workspace_id: string;
      name: string;
      description?: string;
      trigger_type: string;
      trigger_config: Record<string, unknown>;
      agent_id?: string;
      input_template?: string;
    };

    // バリデーション
    if (!body.name?.trim()) return errorResponse("名前は必須です", "VALIDATION_ERROR", 422);
    if (!body.workspace_id) return errorResponse("workspace_idは必須です", "VALIDATION_ERROR", 422);
    if (!["schedule", "webhook", "workflow"].includes(body.trigger_type)) {
      return errorResponse("trigger_typeはschedule, webhook, workflowのいずれかです", "VALIDATION_ERROR", 422);
    }

    // スケジュールの場合: next_run_at を計算（簡易的に現在時刻 + 1時間）
    let nextRunAt: string | null = null;
    if (body.trigger_type === "schedule") {
      nextRunAt = new Date(Date.now() + 3600000).toISOString();
    }

    const { data: automation, error: insertError } = await supabase
      .from("automations")
      .insert({
        workspace_id: body.workspace_id,
        created_by: user.id,
        name: body.name.trim(),
        description: body.description ?? null,
        trigger_type: body.trigger_type,
        trigger_config: body.trigger_config ?? {},
        agent_id: body.agent_id ?? null,
        input_template: body.input_template ?? null,
        next_run_at: nextRunAt,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[POST /api/automations] DBエラー:", insertError);
      return errorResponse("自動化の作成に失敗しました", "DB_ERROR", 500);
    }

    // Webhookの場合はトークンを自動生成
    if (body.trigger_type === "webhook" && automation) {
      const token = crypto.randomBytes(32).toString("hex");
      await supabase.from("webhook_tokens").insert({
        automation_id: automation.id,
        token,
      });
    }

    return NextResponse.json({ automation }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/automations]:", err);
    return errorResponse(err instanceof Error ? err.message : "予期せぬエラー", "INTERNAL_SERVER_ERROR", 500);
  }
}
