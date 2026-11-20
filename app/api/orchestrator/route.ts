/**
 * オーケストレーター API
 * POST /api/orchestrator
 *
 * ユーザーの自然言語入力を受け取り：
 *   1. 既存スキルとマッチング（キーワード + AIセマンティック判定）
 *   2. マッチあり → そのスキルで実行
 *   3. マッチなし → 新しいスキルを自動生成 → 保存 → 実行
 *
 * コスト最適化戦略:
 *   - Step 1: キーワードマッチ（無料、DB検索のみ）
 *   - Step 2: AIマッチング（Haiku = 低コスト）で候補を選別
 *   - Step 3: マッチしたスキルの実行はユーザー指定モデル
 *   - Step 4: スキル生成のみ高性能モデル使用
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { authenticateRequest } from "@/lib/api-auth";
import { getAIProvider, estimateCost, resolveAvailableModel } from "@/lib/ai-client";
import { GoogleProvider } from "@/lib/ai-providers/google";
import type { AIProvider } from "@/lib/ai-providers/types";
import { checkCostLimit } from "@/lib/cost-guard";
import type { ApiError, Skill, WorkflowStep } from "@/lib/types";

/**
 * マッチング用・生成用モデルをワークスペースの登録キーに基づき動的解決する。
 * Anthropicキーがなくても、Google/OpenAIキーがあれば動作する。
 */
async function resolveOrchestratorModels(workspaceId: string): Promise<{
  matchingModel: string;
  generationModel: string;
}> {
  const [matchingModel, generationModel] = await Promise.all([
    resolveAvailableModel(workspaceId, "fast"),
    resolveAvailableModel(workspaceId, "smart"),
  ]);
  return { matchingModel, generationModel };
}

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

// ============================================================
// Step 0: 画像生成の意図検知（無料、キーワードベース）
// ============================================================
const IMAGE_INTENT_KEYWORDS = [
  "画像を生成", "画像生成", "画像を作", "画像作成",
  "イラストを生成", "イラスト生成", "イラストを作", "イラスト作成",
  "写真を生成", "写真生成", "写真を作",
  "絵を描", "絵を生成", "generate image", "create image",
  "draw", "picture of", "photo of", "illustration of",
  "image of", "generate a", "画像で",
] as const;

function detectImageIntent(input: string): boolean {
  const lower = input.toLowerCase();
  return IMAGE_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

/** 画像生成を実行する（Google APIキーが必要） */
async function executeImageGeneration(
  input: string,
  workspaceId: string
): Promise<{
  output: string;
  imageBase64: string;
  mimeType: string;
  costUsd: number;
  latencyMs: number;
}> {
  // Google APIキーを解決
  const apiKey = await resolveGoogleApiKey(workspaceId);

  const provider = new GoogleProvider(apiKey);
  const startedAt = Date.now();

  const result = await provider.generateImage({
    prompt: input,
    aspectRatio: "16:9",
    imageSize: "1K",
  });

  const latencyMs = Date.now() - startedAt;
  const costUsd = 0.039; // gemini-2.5-flash-image 1K概算

  return {
    output: result.text || "画像を生成しました。",
    imageBase64: result.imageBase64,
    mimeType: result.mimeType,
    costUsd,
    latencyMs,
  };
}

/** Google APIキーを解決する */
async function resolveGoogleApiKey(workspaceId: string): Promise<string> {
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

  throw new Error("Google APIキーが未登録です。「設定」画面からGoogle AIのAPIキーを登録してください。");
}

// ============================================================
// Step 1: キーワードベースの候補抽出（無料）
// ============================================================
async function findCandidatesByKeyword(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: string
): Promise<Skill[]> {
  // 入力からキーワードを抽出（簡易的に空白 + 句読点で分割）
  const words = input
    .toLowerCase()
    .replace(/[、。！？,.!?]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (words.length === 0) return [];

  // trigger_keywords の GIN インデックスを使って高速検索
  // + 名前・説明の部分一致
  const searchTerms = words.slice(0, 5).join(" | ");
  const { data } = await supabase
    .from("skills")
    .select("*")
    .eq("is_active", true)
    .or(`name.ilike.%${words[0]}%,description.ilike.%${words[0]}%,intent_description.ilike.%${words[0]}%`)
    .order("use_count", { ascending: false })
    .limit(10);

  // キーワード配列とのオーバーラップでもフィルタ
  const { data: keywordMatches } = await supabase
    .from("skills")
    .select("*")
    .eq("is_active", true)
    .overlaps("trigger_keywords", words)
    .order("use_count", { ascending: false })
    .limit(10);

  // 重複排除して統合
  const allCandidates = [...(data ?? []), ...(keywordMatches ?? [])];
  const seen = new Set<string>();
  return allCandidates.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

// ============================================================
// Step 2: AIセマンティックマッチング（Haiku = 低コスト）
// ============================================================
async function semanticMatch(
  matchingProvider: AIProvider,
  matchingModel: string,
  input: string,
  candidates: Skill[]
): Promise<Skill | null> {
  if (candidates.length === 0) return null;

  const candidateList = candidates.map((s, i) =>
    `${i + 1}. [${s.id}] "${s.name}" — ${s.intent_description || s.description}`
  ).join("\n");

  const response = await matchingProvider.chat({
    model: matchingModel,
    maxTokens: 200,
    temperature: 0,
    systemPrompt: `あなたはスキルマッチングエンジンです。
ユーザーの入力に最も適したスキルを候補から選んでください。
適切なスキルがない場合は "NONE" と返してください。
回答はスキルのIDのみ、または "NONE" のみを返してください。`,
    messages: [{
      role: "user",
      content: `ユーザー入力: "${input}"\n\n候補スキル:\n${candidateList}`,
    }],
  });

  const text = response.output.trim();

  if (text === "NONE" || text === "") return null;

  // IDを抽出してマッチ
  return candidates.find((s) => text.includes(s.id)) ?? null;
}

// ============================================================
// Step 3: スキル自動生成（Sonnet = バランス）
// ============================================================
async function generateSkill(
  generationProvider: AIProvider,
  generationModel: string,
  input: string,
  workspaceId: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Skill> {
  const response = await generationProvider.chat({
    model: generationModel,
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: `あなたはAIスキル設計の専門家です。
ユーザーの入力に基づき、再利用可能なスキル定義を生成してください。

重要: Web検索・リサーチ・最新情報の取得が必要なスキルの場合は、
tagsに "web_search" を必ず含めてください。
また、system_promptに「Web検索ツールを使って最新情報を取得してください」等の指示を含めてください。

以下のJSON形式で返してください:
{
  "name": "スキル名（簡潔に、20文字以内）",
  "description": "説明（1-2文）",
  "intent_description": "このスキルが対応する意図の説明（AIマッチング用）",
  "trigger_keywords": ["キーワード1", "キーワード2", ...],
  "skill_type": "prompt",
  "system_prompt": "システムプロンプト本文",
  "temperature": 0.7,
  "max_tokens": 4096,
  "tags": ["タグ1", "タグ2"]
}

JSONのみを返してください。`,
    messages: [{
      role: "user",
      content: `以下の要求に対応するスキルを設計してください:\n\n"${input}"`,
    }],
  });

  const text = response.output;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("スキル定義の生成に失敗しました");

  const generated = JSON.parse(jsonMatch[0]) as {
    name: string;
    description: string;
    intent_description: string;
    trigger_keywords: string[];
    skill_type: string;
    system_prompt: string;
    temperature: number;
    max_tokens: number;
    tags: string[];
  };

  // DBに保存
  const { data: skill, error } = await supabase
    .from("skills")
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      name: generated.name,
      description: generated.description,
      intent_description: generated.intent_description,
      trigger_keywords: generated.trigger_keywords,
      skill_type: generated.skill_type ?? "prompt",
      system_prompt: generated.system_prompt,
      model: generationModel,
      temperature: generated.temperature ?? 0.7,
      max_tokens: generated.max_tokens ?? 4096,
      tags: generated.tags ?? [],
      is_auto_generated: true,
    })
    .select()
    .single();

  if (error || !skill) throw new Error(`スキルの保存に失敗: ${error?.message}`);

  return skill as Skill;
}

// ============================================================
// Step 4: スキル実行
// ============================================================
async function executeSkill(
  executionProvider: AIProvider,
  skill: Skill,
  input: string
): Promise<{ output: string; inputTokens: number; outputTokens: number; costUsd: number }> {
  if (skill.skill_type === "prompt" && skill.system_prompt) {
    const result = await executionProvider.chat({
      model: skill.model,
      maxTokens: skill.max_tokens,
      systemPrompt: skill.system_prompt,
      temperature: skill.temperature,
      messages: [{ role: "user", content: input }],
    });

    return {
      output: result.output,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: estimateCost(skill.model, result.inputTokens, result.outputTokens),
    };
  }

  if (skill.skill_type === "command" && skill.input_template) {
    const resolvedInput = skill.input_template.replace(/\{\{input\}\}/g, input);
    const result = await executionProvider.chat({
      model: skill.model,
      maxTokens: skill.max_tokens,
      systemPrompt: skill.system_prompt ?? "あなたは有能なアシスタントです。",
      temperature: skill.temperature,
      messages: [{ role: "user", content: resolvedInput }],
    });

    return {
      output: result.output,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: estimateCost(skill.model, result.inputTokens, result.outputTokens),
    };
  }

  throw new Error(`スキルタイプ "${skill.skill_type}" の実行は未対応です`);
}

// ============================================================
// メインエンドポイント
// ============================================================
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    // Cookie認証 + APIキー認証の両方に対応
    const auth = await authenticateRequest(request);
    if (!auth.authenticated || !auth.supabase) {
      return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
    }

    const supabase = auth.supabase;
    const userId = auth.userId!;

    const body = await request.json() as { input: string; auto_create?: boolean };

    if (!body.input?.trim()) {
      return errorResponse("入力は必須です", "VALIDATION_ERROR", 422);
    }

    const input = body.input.trim();
    const autoCreate = body.auto_create !== false; // デフォルトtrue

    // ワークスペースIDを取得
    let workspaceId = auth.workspaceId;
    if (!workspaceId) {
      // Cookie認証の場合はメンバーシップから取得
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1)
        .single();
      workspaceId = member?.workspace_id ?? null;
    }

    if (!workspaceId) return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);

    // コスト上限チェック
    const costCheck = await checkCostLimit(workspaceId);
    if (!costCheck.allowed) {
      return NextResponse.json<ApiError>(
        {
          error: "月間コスト上限に達しました",
          code: "COST_LIMIT_EXCEEDED",
          details: { currentUsd: costCheck.currentUsd, limitUsd: costCheck.limitUsd, percentUsed: costCheck.percentUsed },
        },
        { status: 429 }
      );
    }

    // --- Step 0: 画像生成の意図を検知 ---
    if (detectImageIntent(input)) {
      try {
        const imageResult = await executeImageGeneration(input, workspaceId);
        const latencyMs = Date.now() - startedAt;

        // 実行ログを保存
        await supabase.from("skill_executions").insert({
          workspace_id: workspaceId,
          user_id: userId,
          original_input: input,
          resolved_input: input,
          output: imageResult.output,
          status: "success",
          was_auto_created: false,
          latency_ms: latencyMs,
          cost_usd: imageResult.costUsd,
        });

        return NextResponse.json({
          match_type: "image_generation",
          skill: {
            id: "built-in:image-generation",
            name: "画像生成",
            description: "Gemini画像生成モデルで画像を生成",
            skill_type: "image",
            is_auto_generated: false,
          },
          output: imageResult.output,
          image_base64: imageResult.imageBase64,
          mime_type: imageResult.mimeType,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cost_usd: imageResult.costUsd,
            latency_ms: latencyMs,
          },
        });
      } catch (imgErr) {
        // 画像生成に失敗したら通常フローにフォールバック
        console.warn("[orchestrator] 画像生成にフォールバック:", imgErr);
      }
    }

    // プロバイダーを取得（ワークスペースの登録キーに基づき動的解決）
    const { matchingModel, generationModel } = await resolveOrchestratorModels(workspaceId);
    const matchingProvider = await getAIProvider(matchingModel, workspaceId);
    const generationProvider = await getAIProvider(generationModel, workspaceId);

    // --- Step 1: キーワードマッチ（無料） ---
    const candidates = await findCandidatesByKeyword(supabase, input);

    // --- Step 2: AIセマンティックマッチ（Haiku = 低コスト） ---
    let matchedSkill: Skill | null = null;
    if (candidates.length > 0) {
      matchedSkill = await semanticMatch(matchingProvider, matchingModel, input, candidates as Skill[]);
    }

    let matchType: "existing" | "created" = "existing";
    let wasAutoCreated = false;

    // --- Step 3: マッチなし → スキル自動生成 ---
    if (!matchedSkill) {
      if (!autoCreate) {
        return NextResponse.json({
          match_type: "none",
          message: "適切なスキルが見つかりませんでした。auto_create=true で自動生成できます。",
          candidates: candidates.map((c) => ({ id: c.id, name: c.name, description: c.description })),
        });
      }

      matchedSkill = await generateSkill(generationProvider, generationModel, input, workspaceId, userId, supabase);
      matchType = "created";
      wasAutoCreated = true;
    }

    // --- Step 4: スキル実行（スキルに設定されたモデルのプロバイダーを使用） ---
    const executionProvider = await getAIProvider(matchedSkill.model, workspaceId);
    const { output, inputTokens, outputTokens, costUsd } = await executeSkill(executionProvider, matchedSkill, input);

    const latencyMs = Date.now() - startedAt;

    // 実行ログを保存
    await supabase.from("skill_executions").insert({
      skill_id: matchedSkill.id,
      workspace_id: workspaceId,
      user_id: userId,
      original_input: input,
      resolved_input: input,
      output,
      status: "success",
      was_auto_created: wasAutoCreated,
      latency_ms: latencyMs,
      cost_usd: costUsd,
    });

    // スキルの使用カウントを更新
    await supabase.from("skills").update({
      use_count: (matchedSkill.use_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    }).eq("id", matchedSkill.id);

    return NextResponse.json({
      match_type: matchType,
      skill: {
        id: matchedSkill.id,
        name: matchedSkill.name,
        description: matchedSkill.description,
        skill_type: matchedSkill.skill_type,
        is_auto_generated: matchedSkill.is_auto_generated || wasAutoCreated,
      },
      output,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        latency_ms: latencyMs,
      },
    });
  } catch (err) {
    console.error("[POST /api/orchestrator]:", err);
    return errorResponse(
      err instanceof Error ? err.message : "オーケストレーターでエラーが発生しました",
      "ORCHESTRATOR_ERROR",
      500
    );
  }
}
