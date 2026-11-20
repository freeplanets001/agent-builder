/**
 * AI支援プロンプト生成 API
 * POST /api/ai/generate-prompt
 *
 * ユーザーが「目的」を入力すると、最適なシステムプロンプトを生成する
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { chat, resolveAvailableModel } from "@/lib/ai-client";
import type { ApiError } from "@/lib/types";

const META_PROMPT = `あなたはAIエージェントのシステムプロンプト設計の専門家です。
ユーザーの目的に基づき、最適なシステムプロンプトを生成してください。

以下の原則に従ってください:
1. エージェントの役割・専門性を明確に定義する
2. 出力形式・トーン・制約を具体的に指定する
3. エッジケースやNG例を含める
4. 必要に応じて{{変数名}}の形式でプロンプト変数を使う
5. 日本語で生成する（ユーザーが英語を指定した場合を除く）

レスポンスは以下のJSON形式で返してください:
{
  "name": "エージェント名（簡潔に）",
  "description": "説明（1-2文）",
  "system_prompt": "システムプロンプト本文",
  "tags": ["タグ1", "タグ2"],
  "suggested_temperature": 0.7,
  "suggested_model": "claude-sonnet-4-6"
}

JSONのみを返し、他のテキストは含めないでください。`;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiError>(
        { error: "認証が必要です", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await request.json() as { purpose: string; context?: string };

    if (!body.purpose || body.purpose.trim().length === 0) {
      return NextResponse.json<ApiError>(
        { error: "目的の入力は必須です", code: "VALIDATION_ERROR" },
        { status: 422 }
      );
    }

    const userMessage = body.context
      ? `目的: ${body.purpose}\n\n追加コンテキスト: ${body.context}`
      : `目的: ${body.purpose}`;

    // ワークスペースIDを取得（DB登録APIキーの解決用）
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const workspaceId = member?.workspace_id ?? null;
    const model = await resolveAvailableModel(workspaceId, "smart");

    const response = await chat(model, META_PROMPT, userMessage, {
      workspaceId,
    });

    const text = response.output;

    // JSONを抽出（コードブロックで囲まれている場合も対応）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json<ApiError>(
        { error: "AIからの応答を解析できませんでした", code: "PARSE_ERROR" },
        { status: 500 }
      );
    }

    const generated = JSON.parse(jsonMatch[0]) as {
      name: string;
      description: string;
      system_prompt: string;
      tags: string[];
      suggested_temperature: number;
      suggested_model: string;
    };

    return NextResponse.json({
      ...generated,
      usage: {
        input_tokens: response.inputTokens,
        output_tokens: response.outputTokens,
      },
    });
  } catch (err) {
    console.error("[POST /api/ai/generate-prompt] エラー:", err);
    return NextResponse.json<ApiError>(
      { error: err instanceof Error ? err.message : "プロンプト生成に失敗しました", code: "GENERATION_ERROR" },
      { status: 500 }
    );
  }
}
