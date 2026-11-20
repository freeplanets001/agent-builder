/**
 * スキル CRUD API
 * GET  /api/skills  — 一覧取得
 * POST /api/skills  — 新規作成
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated || !auth.supabase) return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
    const supabase = auth.supabase;

    const { searchParams } = new URL(request.url);
    const skillType = searchParams.get("skill_type");
    const search = searchParams.get("search");

    let query = supabase
      .from("skills")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("use_count", { ascending: false });

    if (skillType) query = query.eq("skill_type", skillType);
    if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,intent_description.ilike.%${search}%`);

    const { data, error, count } = await query;

    if (error) {
      console.error("[GET /api/skills] DBエラー:", error);
      return errorResponse(`DBエラー: ${error.message}`, "DB_ERROR", 500);
    }

    return NextResponse.json({ skills: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[GET /api/skills]:", err);
    return errorResponse(err instanceof Error ? err.message : "予期せぬエラー", "INTERNAL_SERVER_ERROR", 500);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticateRequest(request);
    if (!auth.authenticated || !auth.supabase || !auth.userId) return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
    const supabase = auth.supabase;
    const user = { id: auth.userId };

    const body = await request.json() as Record<string, unknown>;

    if (!body.name || !(body.name as string).trim()) {
      return errorResponse("名前は必須です", "VALIDATION_ERROR", 422);
    }
    if (!body.workspace_id) {
      return errorResponse("workspace_idは必須です", "VALIDATION_ERROR", 422);
    }

    const { data: skill, error: insertError } = await supabase
      .from("skills")
      .insert({
        workspace_id: body.workspace_id,
        created_by: user.id,
        name: (body.name as string).trim(),
        description: body.description ?? "",
        skill_type: body.skill_type ?? "prompt",
        trigger_keywords: body.trigger_keywords ?? [],
        intent_description: body.intent_description ?? "",
        system_prompt: body.system_prompt ?? null,
        model: body.model ?? "claude-sonnet-4-6",
        temperature: body.temperature ?? 0.7,
        max_tokens: body.max_tokens ?? 4096,
        input_template: body.input_template ?? null,
        workflow_steps: body.workflow_steps ?? null,
        agent_id: body.agent_id ?? null,
        tags: body.tags ?? [],
        is_auto_generated: body.is_auto_generated ?? false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[POST /api/skills] DBエラー:", insertError);
      return errorResponse("スキルの作成に失敗しました", "DB_ERROR", 500);
    }

    return NextResponse.json({ skill }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/skills]:", err);
    return errorResponse(err instanceof Error ? err.message : "予期せぬエラー", "INTERNAL_SERVER_ERROR", 500);
  }
}
