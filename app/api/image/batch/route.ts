/**
 * バッチ画像生成 API
 * POST /api/image/batch
 *
 * 1つのプロンプトから複数バリエーションを並列生成する。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { GoogleProvider } from "@/lib/ai-providers/google";
import type { ApiError } from "@/lib/types";

/** 最大同時生成数 */
const MAX_BATCH_SIZE = 4;

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

interface BatchImageResult {
  index: number;
  status: "success" | "error";
  image_base64?: string;
  mime_type?: string;
  text?: string;
  error?: string;
  latency_ms: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  const auth = await authenticateRequest(request);
  if (!auth.authenticated) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const body = await request.json() as {
    prompt?: string;
    num_images?: number;
    model?: string;
    aspect_ratio?: string;
    image_size?: string;
    variations?: string[]; // 追加のバリエーション指示
  };

  if (!body.prompt?.trim()) {
    return errorResponse("prompt は必須です", "VALIDATION_ERROR", 422);
  }

  const numImages = Math.min(body.num_images ?? 2, MAX_BATCH_SIZE);
  if (numImages < 1) {
    return errorResponse("num_images は1以上を指定してください", "VALIDATION_ERROR", 422);
  }

  // ワークスペースID解決
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

  // Google APIキー取得
  const apiKey = await resolveGoogleApiKey(workspaceId);
  if (!apiKey) {
    return errorResponse("Google APIキーが設定されていません", "NO_API_KEY", 400);
  }

  const provider = new GoogleProvider(apiKey);
  const basePrompt = body.prompt.trim();
  const model = body.model ?? "gemini-2.5-flash-image";

  // バリエーション付きプロンプトを生成
  const prompts: string[] = [];
  for (let i = 0; i < numImages; i++) {
    if (body.variations?.[i]) {
      prompts.push(`${basePrompt}, ${body.variations[i]}`);
    } else if (i === 0) {
      prompts.push(basePrompt);
    } else {
      // 自動バリエーション: 微妙に異なるシード的な指示を追加
      const variationHints = [
        "different angle, unique composition",
        "alternative color palette, different mood",
        "close-up perspective, detailed focus",
        "wide panoramic view, expansive scene",
      ];
      prompts.push(`${basePrompt}, ${variationHints[i - 1] ?? `variation ${i + 1}`}`);
    }
  }

  // 並列実行
  const results: BatchImageResult[] = await Promise.all(
    prompts.map(async (prompt, index) => {
      const start = Date.now();
      try {
        const result = await provider.generateImage({
          model,
          prompt,
          aspectRatio: (body.aspect_ratio ?? "16:9") as "16:9",
          imageSize: (body.image_size ?? "1K") as "1K",
        });
        return {
          index,
          status: "success" as const,
          image_base64: result.imageBase64,
          mime_type: result.mimeType,
          text: result.text,
          latency_ms: Date.now() - start,
        };
      } catch (err) {
        return {
          index,
          status: "error" as const,
          error: err instanceof Error ? err.message : "画像生成に失敗しました",
          latency_ms: Date.now() - start,
        };
      }
    })
  );

  const successCount = results.filter((r) => r.status === "success").length;
  const totalLatency = Date.now() - startedAt;

  return NextResponse.json({
    total: numImages,
    success: successCount,
    failed: numImages - successCount,
    model,
    total_latency_ms: totalLatency,
    results,
  });
}

/** Google APIキーを解決する */
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
        return decryptApiKey({
          encrypted: data.encrypted_key,
          iv: data.iv,
          authTag: data.auth_tag,
        });
      }
    } catch {
      // フォールバック
    }
  }
  return null;
}
