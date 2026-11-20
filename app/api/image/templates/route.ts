/**
 * 画像プロンプトテンプレート API
 * GET  /api/image/templates — テンプレート一覧
 * POST /api/image/templates — テンプレート作成
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

const VALID_CATEGORIES = [
  "photorealistic", "anime", "watercolor", "oil_painting",
  "sketch", "pixel_art", "3d_render", "flat_design",
  "cyberpunk", "fantasy", "general",
] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  let query = auth.supabase
    .from("image_prompt_templates")
    .select("*")
    .order("use_count", { ascending: false });

  if (category) {
    query = query.eq("style_category", category);
  }

  const { data, error } = await query;

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  return NextResponse.json({
    templates: data ?? [],
    total: data?.length ?? 0,
    categories: VALID_CATEGORIES,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const body = await request.json() as {
    name?: string;
    description?: string;
    prompt_template?: string;
    negative_prompt?: string;
    style_category?: string;
    default_model?: string;
    default_aspect_ratio?: string;
    default_image_size?: string;
  };

  if (!body.name || !body.prompt_template) {
    return errorResponse("name と prompt_template は必須です", "VALIDATION_ERROR", 422);
  }

  // ワークスペースID取得
  let workspaceId = auth.workspaceId;
  if (!workspaceId) {
    const { data: member } = await auth.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", auth.userId!)
      .limit(1)
      .single();
    workspaceId = member?.workspace_id ?? null;
  }
  if (!workspaceId) return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);

  const { data: template, error } = await auth.supabase
    .from("image_prompt_templates")
    .insert({
      workspace_id: workspaceId,
      name: body.name,
      description: body.description ?? "",
      prompt_template: body.prompt_template,
      negative_prompt: body.negative_prompt ?? "",
      style_category: body.style_category ?? "general",
      default_model: body.default_model ?? "gemini-2.5-flash-image",
      default_aspect_ratio: body.default_aspect_ratio ?? "16:9",
      default_image_size: body.default_image_size ?? "1K",
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, "DB_ERROR", 500);

  return NextResponse.json({ template }, { status: 201 });
}
