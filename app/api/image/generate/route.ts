/**
 * 画像生成 API
 * POST /api/image/generate
 *
 * Gemini の画像生成モデルを使用してテキストプロンプトから画像を生成する。
 * 対応モデル:
 *   - gemini-2.5-flash-image (デフォルト、高速・低コスト)
 *   - gemini-3-pro-image-preview (NanobananaPro、高品質)
 *   - gemini-3.1-flash-image-preview (最新Flash)
 *
 * レスポンスは Base64 エンコードされた画像データを返す。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { GoogleProvider } from "@/lib/ai-providers/google";
import type { ImageGenerateRequest } from "@/lib/ai-providers/types";
import type { ApiError } from "@/lib/types";

/** デフォルトの画像生成モデル */
const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";

/** 利用可能な画像生成モデル */
const VALID_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
  "nano-banana-pro-preview",
  "gemini-3.1-flash-image-preview",
] as const;

/** 有効なアスペクト比 */
const VALID_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"] as const;
type AspectRatio = typeof VALID_ASPECT_RATIOS[number];

/** 有効な画像サイズ */
const VALID_IMAGE_SIZES = ["1K", "2K", "4K"] as const;
type ImageSize = typeof VALID_IMAGE_SIZES[number];

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

function isValidAspectRatio(value: string): value is AspectRatio {
  return (VALID_ASPECT_RATIOS as readonly string[]).includes(value);
}

function isValidImageSize(value: string): value is ImageSize {
  return (VALID_IMAGE_SIZES as readonly string[]).includes(value);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    // 認証
    const auth = await authenticateRequest(request);
    if (!auth.authenticated) {
      return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
    }

    // リクエストボディ解析
    const body = await request.json() as {
      prompt?: string;
      model?: string;
      aspect_ratio?: string;
      image_size?: string;
    };

    if (!body.prompt?.trim()) {
      return errorResponse("prompt は必須です", "VALIDATION_ERROR", 422);
    }

    // バリデーション
    const aspectRatio = body.aspect_ratio ?? "16:9";
    if (!isValidAspectRatio(aspectRatio)) {
      return errorResponse(
        `無効なアスペクト比: ${aspectRatio}。有効値: ${VALID_ASPECT_RATIOS.join(", ")}`,
        "VALIDATION_ERROR",
        422
      );
    }

    const imageSize = body.image_size ?? "1K";
    if (!isValidImageSize(imageSize)) {
      return errorResponse(
        `無効な画像サイズ: ${imageSize}。有効値: ${VALID_IMAGE_SIZES.join(", ")}`,
        "VALIDATION_ERROR",
        422
      );
    }

    // ワークスペースIDを解決（Cookie認証時はnullなのでメンバーシップから取得）
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

    // Google APIキーを解決
    const apiKey = await resolveGoogleApiKey(workspaceId);

    if (!apiKey) {
      return errorResponse(
        "Google APIキーが設定されていません。設定画面から登録するか、環境変数 GOOGLE_API_KEY を設定してください。",
        "NO_API_KEY",
        400
      );
    }

    // モデルバリデーション
    const imageModel = body.model ?? DEFAULT_IMAGE_MODEL;
    if (!VALID_IMAGE_MODELS.includes(imageModel as typeof VALID_IMAGE_MODELS[number])) {
      return errorResponse(
        `無効なモデル: ${imageModel}。有効値: ${VALID_IMAGE_MODELS.join(", ")}`,
        "VALIDATION_ERROR",
        422
      );
    }

    // 画像生成
    const provider = new GoogleProvider(apiKey);
    const imageRequest: ImageGenerateRequest = {
      prompt: body.prompt.trim(),
      aspectRatio,
      imageSize,
    };

    const result = await provider.generateImage({ ...imageRequest, model: imageModel });
    const latencyMs = Date.now() - startedAt;

    return NextResponse.json({
      image_base64: result.imageBase64,
      mime_type: result.mimeType,
      text: result.text,
      model: imageModel,
      latency_ms: latencyMs,
    });
  } catch (err) {
    console.error("[POST /api/image/generate]:", err);
    return errorResponse(
      err instanceof Error ? err.message : "画像生成でエラーが発生しました",
      "IMAGE_GENERATION_ERROR",
      500
    );
  }
}

/**
 * Google APIキーを解決する（DB → 環境変数の順）
 */
async function resolveGoogleApiKey(workspaceId: string | null): Promise<string | null> {
  // DBから取得を試みる
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
        return decryptApiKey({
          encrypted: data.encrypted_key,
          iv: data.iv,
          authTag: data.auth_tag,
        });
      }
    } catch {
      // DB取得失敗時は環境変数にフォールバック
    }
  }

  // DBにキーがなければnull
  return null;
}
