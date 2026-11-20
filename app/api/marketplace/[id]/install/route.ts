/**
 * マーケットプレイスインストール API
 * POST /api/marketplace/[id]/install
 *
 * 公開エージェントのスナップショットから自分のワークスペースに複製する。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: listingId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;

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

  // リスティング取得
  const { data: listing, error: listingError } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("id", listingId)
    .eq("status", "published")
    .single();

  if (listingError || !listing) {
    return errorResponse("リスティングが見つかりません", "NOT_FOUND", 404);
  }

  // スナップショットからエージェントを複製
  const { data: newAgent, error: agentError } = await supabase
    .from("agents")
    .insert({
      workspace_id: workspaceId,
      name: `${listing.title} (マーケットプレイスから)`,
      description: listing.description,
      system_prompt: listing.snapshot_system_prompt,
      model: listing.snapshot_model,
      temperature: listing.snapshot_temperature,
      max_tokens: listing.snapshot_max_tokens,
      tags: listing.tags ?? [],
      visibility: "private",
    })
    .select("id, name")
    .single();

  if (agentError || !newAgent) {
    return errorResponse(`エージェントの作成に失敗: ${agentError?.message}`, "DB_ERROR", 500);
  }

  // インストール数を更新
  await supabase
    .from("marketplace_listings")
    .update({ install_count: (listing.install_count ?? 0) + 1 })
    .eq("id", listingId);

  return NextResponse.json({
    message: `「${listing.title}」をインストールしました`,
    agent: newAgent,
  }, { status: 201 });
}
