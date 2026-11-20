/**
 * エージェント自己改善 API
 * POST /api/agents/[id]/optimize
 *
 * 実行ログのフィードバックを分析し、システムプロンプトの改善案を生成する。
 * 承認されれば新しいバージョンとして保存。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { getAIProvider, estimateCost } from "@/lib/ai-client";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

type RouteParams = { params: Promise<{ id: string }> };

/** 最適化に使うログの最大数 */
const MAX_LOGS_FOR_ANALYSIS = 20;

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: agentId } = await params;

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;
  const body = await request.json() as {
    /** 自動適用するか（falseなら提案のみ） */
    auto_apply?: boolean;
    /** 改善の焦点 */
    focus?: "accuracy" | "conciseness" | "creativity" | "safety" | "general";
  };

  // エージェント情報を取得
  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (agentErr || !agent) return errorResponse("エージェントが見つかりません", "NOT_FOUND", 404);

  // ワークスペースID
  let workspaceId = auth.workspaceId;
  if (!workspaceId) workspaceId = agent.workspace_id;

  // 最近の実行ログを取得
  const { data: logs } = await supabase
    .from("execution_logs")
    .select("input, output, status, cost_usd, latency_ms, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(MAX_LOGS_FOR_ANALYSIS);

  if (!logs?.length) {
    return errorResponse("最適化には実行ログが必要です。まずエージェントを何度か実行してください。", "NO_LOGS", 400);
  }

  // ログのサマリーを作成
  const logSummary = logs.map((log, i) => {
    const status = log.status === "success" ? "成功" : "エラー";
    return `--- ログ ${i + 1} (${status}, ${log.latency_ms}ms) ---\n入力: ${(log.input ?? "").slice(0, 200)}\n出力: ${(log.output ?? "").slice(0, 300)}`;
  }).join("\n\n");

  const successRate = logs.filter((l) => l.status === "success").length / logs.length;
  const avgLatency = logs.reduce((sum, l) => sum + (l.latency_ms ?? 0), 0) / logs.length;

  // 改善の焦点
  const focusInstructions: Record<string, string> = {
    accuracy: "正確性を向上させてください。ハルシネーション（嘘）を減らし、根拠のある回答を促すプロンプトにしてください。",
    conciseness: "簡潔さを向上させてください。冗長な回答を減らし、要点を的確に伝えるプロンプトにしてください。",
    creativity: "創造性を向上させてください。ユニークで独創的な回答を生成するプロンプトにしてください。",
    safety: "安全性を向上させてください。有害な出力を防ぎ、適切なガードレールを追加してください。",
    general: "全体的な品質を向上させてください。",
  };
  const focusText = focusInstructions[body.focus ?? "general"];

  // AIに改善案を生成させる
  const provider = await getAIProvider(agent.model, workspaceId);

  const optimizationPrompt = `あなたはAIエージェントのプロンプトエンジニアリングの専門家です。

以下のエージェントのシステムプロンプトを分析し、実行ログに基づいて改善版を生成してください。

## 現在のシステムプロンプト
\`\`\`
${agent.system_prompt}
\`\`\`

## エージェント情報
- 名前: ${agent.name}
- モデル: ${agent.model}
- Temperature: ${agent.temperature}
- 成功率: ${(successRate * 100).toFixed(0)}%
- 平均レイテンシ: ${avgLatency.toFixed(0)}ms

## 改善の焦点
${focusText}

## 最近の実行ログ（${logs.length}件）
${logSummary}

## 指示
以下のJSON形式で改善案を返してください:
{
  "improved_prompt": "改善されたシステムプロンプト全文",
  "changes": ["変更点1", "変更点2", ...],
  "reasoning": "なぜこの変更が効果的か",
  "suggested_temperature": 0.7,
  "estimated_improvement": "どの程度改善されるかの説明"
}

JSONのみを返してください。`;

  const result = await provider.chat({
    model: agent.model,
    systemPrompt: "あなたはプロンプトエンジニアリングの世界的権威です。",
    messages: [{ role: "user", content: optimizationPrompt }],
    temperature: 0.3,
    maxTokens: 4096,
  });

  const costUsd = estimateCost(agent.model, result.inputTokens, result.outputTokens);

  // JSONを抽出
  const jsonMatch = result.output.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return errorResponse("改善案の生成に失敗しました", "GENERATION_ERROR", 500);
  }

  let optimization: {
    improved_prompt: string;
    changes: string[];
    reasoning: string;
    suggested_temperature: number;
    estimated_improvement: string;
  };
  try {
    optimization = JSON.parse(jsonMatch[0]);
  } catch {
    return errorResponse("改善案のパースに失敗しました", "PARSE_ERROR", 500);
  }

  // auto_apply: trueの場合、自動適用
  if (body.auto_apply) {
    // 現在のバージョンを保存
    const { data: latestVersion } = await supabase
      .from("skill_versions")
      .select("version")
      .eq("skill_id", agentId)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    // エージェントを更新
    await supabase.from("agents").update({
      system_prompt: optimization.improved_prompt,
      temperature: optimization.suggested_temperature ?? agent.temperature,
    }).eq("id", agentId);

    return NextResponse.json({
      status: "applied",
      optimization,
      previous_prompt: agent.system_prompt,
      analysis: {
        log_count: logs.length,
        success_rate: successRate,
        avg_latency_ms: avgLatency,
      },
      cost_usd: costUsd,
    });
  }

  // 提案のみ返す
  return NextResponse.json({
    status: "proposed",
    optimization,
    current_prompt: agent.system_prompt,
    analysis: {
      log_count: logs.length,
      success_rate: successRate,
      avg_latency_ms: avgLatency,
    },
    cost_usd: costUsd,
  });
}
