/**
 * マルチエージェント協調 API
 * POST /api/agents/collaborate
 *
 * 複数のエージェントが会話形式で協調して問題を解決する。
 *
 * モード:
 *   - debate:      議論（賛成/反対の立場で議論）
 *   - brainstorm:  ブレインストーミング（自由にアイデアを出し合う）
 *   - review:      レビュー（1つのエージェントの出力を他がレビュー）
 *   - roundrobin:  順番に発言（各エージェントが順に意見を述べる）
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { getAIProvider, estimateCost } from "@/lib/ai-client";
import type { ApiError } from "@/lib/types";

function errorResponse(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

type CollaborationMode = "debate" | "brainstorm" | "review" | "roundrobin";

interface CollaborationStep {
  agent_id: string;
  agent_name: string;
  role: string;
  message: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

/** 最大ラウンド数 */
const MAX_ROUNDS = 5;

/** モード別のシステムプロンプト補足 */
const MODE_INSTRUCTIONS: Record<CollaborationMode, (role: string, topic: string) => string> = {
  debate: (role, topic) =>
    `あなたは「${role}」の立場でディベートに参加しています。\n議題: ${topic}\nあなたの立場を論理的に主張し、相手の主張に反論してください。簡潔に（200字以内）。`,
  brainstorm: (_role, topic) =>
    `ブレインストーミングセッションに参加しています。\nテーマ: ${topic}\n他の参加者のアイデアに触発されつつ、新しい独創的なアイデアを提案してください。批判は禁止。簡潔に。`,
  review: (role, topic) =>
    `あなたは「${role}」としてレビューを行います。\n対象: ${topic}\n建設的なフィードバックを提供してください。良い点と改善点を簡潔に。`,
  roundrobin: (role, topic) =>
    `あなたは「${role}」として議論に参加しています。\n議題: ${topic}\n前の発言者の内容を踏まえて、あなたの専門的な観点から意見を述べてください。簡潔に。`,
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase) {
    return errorResponse(auth.error ?? "認証が必要です", "UNAUTHORIZED", 401);
  }

  const supabase = auth.supabase;
  const body = await request.json() as {
    agent_ids?: string[];
    topic?: string;
    mode?: CollaborationMode;
    rounds?: number;
    /** debate時: 各エージェントの立場 */
    roles?: string[];
    initial_context?: string;
  };

  if (!body.agent_ids?.length || body.agent_ids.length < 2) {
    return errorResponse("agent_ids は2つ以上必要です", "VALIDATION_ERROR", 422);
  }
  if (!body.topic?.trim()) {
    return errorResponse("topic は必須です", "VALIDATION_ERROR", 422);
  }
  if (body.agent_ids.length > 5) {
    return errorResponse("エージェントは最大5つまでです", "VALIDATION_ERROR", 422);
  }

  const mode = body.mode ?? "roundrobin";
  const rounds = Math.min(body.rounds ?? 3, MAX_ROUNDS);
  const topic = body.topic.trim();

  // ワークスペースID
  let workspaceId = auth.workspaceId;
  if (!workspaceId) {
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", auth.userId!)
      .limit(1)
      .single();
    workspaceId = member?.workspace_id ?? null;
  }
  if (!workspaceId) return errorResponse("ワークスペースが見つかりません", "NO_WORKSPACE", 404);

  // エージェント情報を取得
  const agents: Array<{ id: string; name: string; system_prompt: string; model: string; temperature: number; max_tokens: number }> = [];
  for (const agentId of body.agent_ids) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, system_prompt, model, temperature, max_tokens")
      .eq("id", agentId)
      .single();
    if (!agent) return errorResponse(`エージェント ${agentId} が見つかりません`, "NOT_FOUND", 404);
    agents.push(agent);
  }

  // 協調セッション実行
  const steps: CollaborationStep[] = [];
  const conversation: string[] = [];
  let totalCost = 0;

  // 初期コンテキスト
  if (body.initial_context) {
    conversation.push(`[コンテキスト] ${body.initial_context}`);
  }
  conversation.push(`[議題] ${topic}`);

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const role = body.roles?.[i] ?? agent.name;
      const modeInstruction = MODE_INSTRUCTIONS[mode](role, topic);

      // これまでの会話を含めたプロンプト
      const contextPrompt = [
        agent.system_prompt,
        "",
        modeInstruction,
        "",
        "--- これまでの議論 ---",
        ...conversation,
        "--- ここまで ---",
        "",
        `あなた（${role}）の番です。発言してください。`,
      ].join("\n");

      try {
        const provider = await getAIProvider(agent.model, workspaceId);
        const result = await provider.chat({
          model: agent.model,
          systemPrompt: contextPrompt,
          messages: [{ role: "user", content: `ラウンド${round + 1}: ${topic}について発言してください。` }],
          temperature: agent.temperature,
          maxTokens: Math.min(agent.max_tokens, 1024), // 協調時は短めに
        });

        const costUsd = estimateCost(agent.model, result.inputTokens, result.outputTokens);
        totalCost += costUsd;

        const step: CollaborationStep = {
          agent_id: agent.id,
          agent_name: agent.name,
          role,
          message: result.output,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          cost_usd: costUsd,
        };
        steps.push(step);

        // 会話履歴に追加
        conversation.push(`[${role} / ${agent.name}] ${result.output}`);
      } catch (err) {
        steps.push({
          agent_id: agent.id,
          agent_name: agent.name,
          role,
          message: `エラー: ${err instanceof Error ? err.message : "不明"}`,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
        });
      }
    }
  }

  // まとめの生成（最初のエージェントに依頼）
  let summary = "";
  try {
    const summarizer = agents[0];
    const summaryProvider = await getAIProvider(summarizer.model, workspaceId);
    const summaryResult = await summaryProvider.chat({
      model: summarizer.model,
      systemPrompt: "あなたは議論のファシリテーターです。以下の議論を簡潔にまとめてください。主要な論点、合意点、分岐点を整理してください。",
      messages: [{ role: "user", content: conversation.join("\n") }],
      temperature: 0.3,
      maxTokens: 1024,
    });
    summary = summaryResult.output;
    totalCost += estimateCost(summarizer.model, summaryResult.inputTokens, summaryResult.outputTokens);
  } catch {
    summary = "(まとめの生成に失敗しました)";
  }

  return NextResponse.json({
    mode,
    topic,
    rounds,
    agents: agents.map((a) => ({ id: a.id, name: a.name })),
    steps,
    summary,
    total_cost_usd: totalCost,
    total_latency_ms: Date.now() - startedAt,
    conversation,
  });
}
