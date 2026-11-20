/**
 * スキルバージョン API
 * GET  /api/skills/[id]/versions — バージョン一覧
 * POST /api/skills/[id]/versions — 現在の状態をバージョンとして保存
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id: skillId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { data, error } = await auth.supabase
    .from("skill_versions")
    .select("*")
    .eq("skill_id", skillId)
    .order("version", { ascending: false });

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  return NextResponse.json({ versions: data ?? [], total: data?.length ?? 0 });
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id: skillId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;
  const body = await request.json() as { change_summary?: string };

  // 現在のスキル情報を取得
  const { data: skill, error: skillErr } = await supabase
    .from("skills")
    .select("*")
    .eq("id", skillId)
    .single();

  if (skillErr || !skill) return errorResponse("スキルが見つかりません", "NOT_FOUND", 404);

  // 最新バージョン番号を取得
  const { data: latest } = await supabase
    .from("skill_versions")
    .select("version")
    .eq("skill_id", skillId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version ?? 0) + 1;

  // バージョンを保存
  const { data: version, error: versionErr } = await supabase
    .from("skill_versions")
    .insert({
      skill_id: skillId,
      version: nextVersion,
      system_prompt: skill.system_prompt,
      model: skill.model,
      temperature: skill.temperature,
      max_tokens: skill.max_tokens,
      trigger_keywords: skill.trigger_keywords,
      tags: skill.tags,
      change_summary: body.change_summary ?? `v${nextVersion} スナップショット`,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (versionErr) return errorResponse(versionErr.message, "DB_ERROR", 500);

  return NextResponse.json({ version }, { status: 201 });
}
