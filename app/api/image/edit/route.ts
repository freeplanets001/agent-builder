/**
 * 画像編集 API (Image-to-Image)
 * POST /api/image/edit
 *
 * 既存画像 + テキスト指示で画像を編集する。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { GoogleProvider } from "@/lib/ai-providers/google";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  const auth = await authenticateRequest(request);
  if (!auth.authenticated) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const body = await request.json() as {
    image_base64?: string;
    mime_type?: string;
    prompt?: string;
    model?: string;
  };

  if (!body.image_base64) {
    return errorResponse("image_base64 は必須です", "VALIDATION_ERROR", 422);
  }
  if (!body.prompt?.trim()) {
    return errorResponse("prompt は必須です", "VALIDATION_ERROR", 422);
  }

  let workspaceId = auth.workspaceId;
  if (!workspaceId && auth.supabase) {
    const { data: member } = await auth.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", auth.userId!)
      .limit(1)
      .single();
    workspaceId = member?.workspace_id ?? null;
  }

  const apiKey = await resolveGoogleApiKey(workspaceId);
  if (!apiKey) {
    return errorResponse("Google APIキーが設定されていません", "NO_API_KEY", 400);
  }

  try {
    const provider = new GoogleProvider(apiKey);
    const result = await provider.editImage({
      imageBase64: body.image_base64,
      imageMimeType: body.mime_type ?? "image/png",
      prompt: body.prompt.trim(),
      model: body.model ?? "gemini-2.5-flash-image",
    });

    return NextResponse.json({
      image_base64: result.imageBase64,
      mime_type: result.mimeType,
      text: result.text,
      model: body.model ?? "gemini-2.5-flash-image",
      latency_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[POST /api/image/edit]:", err);
    return errorResponse(
      err instanceof Error ? err.message : "画像編集に失敗しました",
      "IMAGE_EDIT_ERROR",
      500
    );
  }
}

async function resolveGoogleApiKey(workspaceId: string | null): Promise<string | null> {
  if (workspaceId) {
    try {
      const { createServiceRoleClient } = await import("@/lib/supabase-server");
      const { decryptApiKey } = await import("@/lib/crypto");
      const supabase = createServiceRoleClient();
      const { data } = await supabase
        .from("provider_api_keys")
        .select("encrypted_key, iv, auth_tag, is_active")
        .eq("workspace_id", workspaceId)
        .eq("provider", "google")
        .single();
      if (data?.is_active) {
        return decryptApiKey({ encrypted: data.encrypted_key, iv: data.iv, authTag: data.auth_tag });
      }
    } catch { /* フォールバック */ }
  }
  return null;
}
