/**
 * プロバイダーAPIキー管理 API
 *
 * GET  /api/settings/api-keys — 登録済みプロバイダー一覧（キーはマスク表示）
 * POST /api/settings/api-keys — キー登録/更新 + 接続テスト
 * DELETE /api/settings/api-keys — キー削除
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { encryptApiKey, generateKeyHint } from "@/lib/crypto";
import { testProviderConnection } from "@/lib/ai-client";
import type { ProviderId } from "@/lib/ai-providers/types";
import type { ApiError } from "@/lib/types";

const VALID_PROVIDERS: ProviderId[] = ["anthropic", "google", "openai"];

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

// ============================================================
// GET — 登録済みプロバイダーAPIキー一覧
// ============================================================
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  // ワークスペースIDを取得
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

  if (!workspaceId) {
    return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);
  }

  const { data: keys, error } = await auth.supabase
    .from("provider_api_keys")
    .select("id, provider, key_hint, is_active, last_verified_at, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("provider");

  if (error) {
    return errorResponse("APIキーの取得に失敗しました", "DB_ERROR", 500);
  }

  return NextResponse.json({ keys: keys ?? [], workspace_id: workspaceId });
}

// ============================================================
// POST — APIキー登録/更新 + 接続テスト
// ============================================================
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const body = await request.json() as {
    provider: string;
    api_key: string;
    test_connection?: boolean;
  };

  // バリデーション
  if (!body.provider || !VALID_PROVIDERS.includes(body.provider as ProviderId)) {
    return errorResponse(
      `無効なプロバイダーです。有効な値: ${VALID_PROVIDERS.join(", ")}`,
      "VALIDATION_ERROR",
      422
    );
  }

  if (!body.api_key?.trim()) {
    return errorResponse("APIキーは必須です", "VALIDATION_ERROR", 422);
  }

  const provider = body.provider as ProviderId;
  const plainKey = body.api_key.trim();

  // ワークスペースIDを取得
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

  if (!workspaceId) {
    return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);
  }

  // 接続テスト（オプション、デフォルトtrue）
  const shouldTest = body.test_connection !== false;
  let testResult: { ok: boolean; error?: string } | null = null;

  if (shouldTest) {
    testResult = await testProviderConnection(provider, plainKey);
    if (!testResult.ok) {
      return NextResponse.json(
        {
          error: "接続テストに失敗しました",
          code: "CONNECTION_TEST_FAILED",
          details: testResult.error,
        },
        { status: 422 }
      );
    }
  }

  // 暗号化
  const encrypted = encryptApiKey(plainKey);
  const keyHint = generateKeyHint(plainKey);

  // UPSERT（ワークスペース × プロバイダーでユニーク）
  const { data: saved, error } = await auth.supabase
    .from("provider_api_keys")
    .upsert(
      {
        workspace_id: workspaceId,
        provider,
        encrypted_key: encrypted.encrypted,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_hint: keyHint,
        is_active: true,
        last_verified_at: shouldTest && testResult?.ok ? new Date().toISOString() : null,
        created_by: auth.userId!,
      },
      { onConflict: "workspace_id,provider" }
    )
    .select("id, provider, key_hint, is_active, last_verified_at")
    .single();

  if (error) {
    console.error("[POST /api/settings/api-keys]:", error);
    return errorResponse("APIキーの保存に失敗しました", "DB_ERROR", 500);
  }

  return NextResponse.json({
    key: saved,
    test_result: testResult,
    message: `${provider} のAPIキーを${testResult?.ok ? "検証・" : ""}保存しました`,
  });
}

// ============================================================
// DELETE — APIキー削除
// ============================================================
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");

  if (!provider || !VALID_PROVIDERS.includes(provider as ProviderId)) {
    return errorResponse("プロバイダーの指定が必要です", "VALIDATION_ERROR", 422);
  }

  // ワークスペースIDを取得
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

  if (!workspaceId) {
    return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);
  }

  const { error } = await auth.supabase
    .from("provider_api_keys")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("provider", provider);

  if (error) {
    return errorResponse("APIキーの削除に失敗しました", "DB_ERROR", 500);
  }

  return NextResponse.json({ message: `${provider} のAPIキーを削除しました` });
}
