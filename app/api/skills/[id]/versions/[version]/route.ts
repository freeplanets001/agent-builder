/**
 * スキルバージョン詳細・ロールバック API
 * GET  /api/skills/[id]/versions/[version] — 特定バージョン取得
 * POST /api/skills/[id]/versions/[version] — このバージョンにロールバック
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string; version: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id: skillId, version } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { data, error } = await auth.supabase
    .from("skill_versions")
    .select("*")
    .eq("skill_id", skillId)
    .eq("version", Number(version))
    .single();

  if (error || !data) return errorResponse("バージョンが見つかりません", "NOT_FOUND", 404);

  return NextResponse.json({ version: data });
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id: skillId, version } = await params;
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;

  // ロールバック先のバージョンを取得
  const { data: targetVersion, error: vErr } = await supabase
    .from("skill_versions")
    .select("*")
    .eq("skill_id", skillId)
    .eq("version", Number(version))
    .single();

  if (vErr || !targetVersion) return errorResponse("バージョンが見つかりません", "NOT_FOUND", 404);

  // スキルを更新
  const { data: updated, error: updateErr } = await supabase
    .from("skills")
    .update({
      system_prompt: targetVersion.system_prompt,
      model: targetVersion.model,
      temperature: targetVersion.temperature,
      max_tokens: targetVersion.max_tokens,
      trigger_keywords: targetVersion.trigger_keywords,
      tags: targetVersion.tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", skillId)
    .select("id, name, version")
    .single();

  if (updateErr) return errorResponse(updateErr.message, "DB_ERROR", 500);

  return NextResponse.json({
    message: `v${version} にロールバックしました`,
    skill: updated,
  });
}
