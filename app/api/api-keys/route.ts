/**
 * APIキー管理 API
 * GET  /api/api-keys  — 一覧取得（平文キーは返さない）
 * POST /api/api-keys  — 新規発行（作成時のみ平文キーを返す）
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { ApiError } from "@/lib/types";
import crypto from "crypto";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

/** ランダムなAPIキーを生成（プレフィックス付き） */
function generateApiKey(): string {
  const random = crypto.randomBytes(32).toString("hex");
  return `abk_${random}`;
}

/** プレフィックス表示用（先頭4文字 + **** + 末尾4文字） */
function makePrefix(key: string): string {
  return `${key.slice(0, 8)}****${key.slice(-4)}`;
}

/** SHA-256ハッシュ */
function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse("認証が必要です", "UNAUTHORIZED", 401);

    const { data: keys, error } = await supabase
      .from("api_keys")
      .select("id, workspace_id, name, key_prefix, is_active, last_used_at, expires_at, created_at")
      .order("created_at", { ascending: false });

    if (error) return errorResponse(`DBエラー: ${error.message}`, "DB_ERROR", 500);

    return NextResponse.json({ api_keys: keys ?? [] });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "予期せぬエラー", "INTERNAL_SERVER_ERROR", 500);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse("認証が必要です", "UNAUTHORIZED", 401);

    const body = await request.json() as { name: string; workspace_id: string };

    if (!body.name?.trim()) return errorResponse("名前は必須です", "VALIDATION_ERROR", 422);
    if (!body.workspace_id) return errorResponse("workspace_idは必須です", "VALIDATION_ERROR", 422);

    // キーを生成
    const plainKey = generateApiKey();
    const keyHash = hashKey(plainKey);
    const keyPrefix = makePrefix(plainKey);

    const { data: apiKey, error: insertError } = await supabase
      .from("api_keys")
      .insert({
        workspace_id: body.workspace_id,
        created_by: user.id,
        name: body.name.trim(),
        key_prefix: keyPrefix,
        key_hash: keyHash,
      })
      .select("id, workspace_id, name, key_prefix, is_active, created_at")
      .single();

    if (insertError) {
      console.error("[POST /api/api-keys] DBエラー:", insertError);
      return errorResponse("APIキーの作成に失敗しました", "DB_ERROR", 500);
    }

    // 平文キーは作成時のみ返す
    return NextResponse.json({
      api_key: apiKey,
      secret: plainKey,
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "予期せぬエラー", "INTERNAL_SERVER_ERROR", 500);
  }
}
