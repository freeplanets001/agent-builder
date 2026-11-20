/**
 * マーケットプレイス API
 * GET  /api/marketplace — 公開エージェント一覧
 * POST /api/marketplace — エージェントを公開
 *
 * マーケットプレイスは2つのソースからエージェントを表示する:
 * 1. marketplace_listings テーブル（明示的に公開されたもの）
 * 2. agents テーブルの visibility=public（自動的に表示）
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

const CATEGORIES = [
  "general", "writing", "coding", "analysis", "creative",
  "business", "education", "research", "image", "automation",
];

interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  install_count: number;
  avg_rating: string | null;
  rating_count: number;
  snapshot_model: string;
  published_at: string;
  source: "listing" | "public_agent";
  agent_id: string;
}

// ============================================================
// GET — 公開エージェント一覧
// ============================================================
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const sort = searchParams.get("sort") ?? "newest";

  const listings: MarketplaceListing[] = [];

  // ソース1: marketplace_listings テーブルから取得（テーブルが存在する場合）
  try {
    const { data: mlData } = await auth.supabase
      .from("marketplace_listings")
      .select("id, title, description, tags, agent_id, published_at")
      .order("published_at", { ascending: false });

    if (mlData) {
      for (const ml of mlData) {
        listings.push({
          id: ml.id,
          title: ml.title,
          description: ml.description ?? "",
          category: "general",
          tags: ml.tags ?? [],
          install_count: 0,
          avg_rating: null,
          rating_count: 0,
          snapshot_model: "",
          published_at: ml.published_at ?? "",
          source: "listing",
          agent_id: ml.agent_id,
        });
      }
    }
  } catch {
    // テーブルが存在しない場合はスキップ
  }

  // ソース2: visibility=public のエージェントを自動表示
  let agentQuery = auth.supabase
    .from("agents")
    .select("id, name, description, model, tags, created_at, is_active")
    .eq("visibility", "public")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (search) {
    agentQuery = agentQuery.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data: publicAgents } = await agentQuery;

  if (publicAgents) {
    // marketplace_listingsに既にあるエージェントIDを除外
    const listedAgentIds = new Set(listings.map((l) => l.agent_id));

    for (const agent of publicAgents) {
      if (listedAgentIds.has(agent.id)) continue;

      listings.push({
        id: `agent-${agent.id}`,
        title: agent.name,
        description: agent.description ?? "",
        category: "general",
        tags: agent.tags ?? [],
        install_count: 0,
        avg_rating: null,
        rating_count: 0,
        snapshot_model: agent.model,
        published_at: agent.created_at,
        source: "public_agent",
        agent_id: agent.id,
      });
    }
  }

  // 検索フィルタ（marketplace_listings分）
  let filtered = listings;
  if (search) {
    const q = search.toLowerCase();
    filtered = listings.filter((l) =>
      l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)
    );
  }

  // ソート
  if (sort === "newest") {
    filtered.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  }

  return NextResponse.json({
    listings: filtered,
    total: filtered.length,
    categories: CATEGORIES,
  });
}

// ============================================================
// POST — エージェントを公開
// ============================================================
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;
  const body = await request.json() as {
    agent_id?: string;
    title?: string;
    description?: string;
  };

  if (!body.agent_id) {
    return errorResponse("agent_id は必須です", "VALIDATION_ERROR", 422);
  }

  // エージェントを公開状態にする
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .update({ visibility: "public" })
    .eq("id", body.agent_id)
    .select("id, name, description, model, workspace_id")
    .single();

  if (agentError || !agent) {
    return errorResponse("エージェントが見つかりません", "NOT_FOUND", 404);
  }

  // marketplace_listingsにも登録を試みる（テーブルがあれば）
  try {
    await supabase
      .from("marketplace_listings")
      .insert({
        agent_id: body.agent_id,
        workspace_id: agent.workspace_id ?? "",
        published_by: auth.userId,
        title: body.title ?? agent.name,
        description: body.description ?? agent.description ?? "",
        tags: [],
        published_at: new Date().toISOString(),
      });
  } catch {
    // テーブル不完全でも問題なし（agentsのvisibility=publicだけで表示される）
  }

  return NextResponse.json({
    message: `「${agent.name}」をマーケットプレイスに公開しました`,
    agent: { id: agent.id, name: agent.name },
  }, { status: 201 });
}
