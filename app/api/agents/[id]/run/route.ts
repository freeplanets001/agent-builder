/**
 * エージェント実行 API（SSEストリーミング対応）
 * POST /api/agents/[id]/run
 *
 * Request body:
 *   input: string         — ユーザー入力
 *   variables?: object    — プロンプト変数
 *   conversation_id?: string — 会話の継続
 *   stream?: boolean      — ストリーミング有効フラグ（default: true）
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { getAIProvider, estimateCost } from "@/lib/ai-client";
import { getRagContext } from "@/lib/rag-context";
import { buildToolDefinitions, executeTool } from "@/lib/tool-executor";
import { GoogleProvider } from "@/lib/ai-providers/google";
import type { AnthropicProvider } from "@/lib/ai-providers/anthropic";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { decryptApiKey } from "@/lib/crypto";
import { checkCostLimit } from "@/lib/cost-guard";
import { validateAgentOutput, buildRetryPrompt } from "@/lib/structured-output";
import { checkInputGuardrails, checkOutputGuardrails } from "@/lib/guardrails";
import type { AgentGuardrails } from "@/lib/guardrails";
import { retrieveRelevantMemories, buildMemoryContext, extractMemoriesFromConversation } from "@/lib/agent-memory";
import type { AgentRunRequest, StreamEvent, ApiError } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

/** プロンプト変数を展開する */
function expandVariables(
  prompt: string,
  variables: Record<string, string>
): string {
  return Object.entries(variables).reduce(
    (result, [key, value]) => result.replace(new RegExp(`{{${key}}}`, "g"), value),
    prompt
  );
}

/** SSEのテキストエンコーダー */
const encoder = new TextEncoder();

function encodeSSE(event: StreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse | Response> {
  const { id: agentId } = await params;

  // Cookie + APIキー両方対応
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.supabase || !auth.userId) {
    return NextResponse.json<ApiError>(
      { error: auth.error ?? "認証が必要です", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  const supabase = auth.supabase;
  const user = { id: auth.userId };

  // ボディの解析
  let body: AgentRunRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: "リクエストボディが不正です", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  if (!body.input || body.input.trim().length === 0) {
    return NextResponse.json<ApiError>(
      { error: "入力テキストは必須です", code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  // エージェントの取得
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*, agent_tools(*), agent_variables(*)")
    .eq("id", agentId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json<ApiError>(
      { error: "エージェントが見つかりません", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  if (!agent.is_active) {
    return NextResponse.json<ApiError>(
      { error: "このエージェントは無効化されています", code: "AGENT_INACTIVE" },
      { status: 400 }
    );
  }

  // ガードレール設定の取得
  let guardrails: AgentGuardrails | null = null;
  {
    const { data: gr } = await supabase
      .from("agent_guardrails")
      .select("*")
      .eq("agent_id", agentId)
      .single();
    if (gr) guardrails = gr as AgentGuardrails;
  }

  // カナリアリリース: canaryバージョンがあればランダムで振り分け
  let activeSystemPrompt = agent.system_prompt;
  let activeModel = agent.model;
  try {
    const { data: canaryVersion } = await supabase
      .from("agent_versions")
      .select("system_prompt, model, canary_percent")
      .eq("agent_id", agentId)
      .eq("deploy_status", "canary")
      .single();

    if (canaryVersion && canaryVersion.canary_percent > 0) {
      const roll = Math.random() * 100;
      if (roll < canaryVersion.canary_percent) {
        activeSystemPrompt = canaryVersion.system_prompt;
        activeModel = canaryVersion.model;
      }
    }
  } catch {
    // カナリアバージョンなし → 通常実行
  }

  // 変数の展開
  const variables = body.variables ?? {};
  const expandedPrompt = expandVariables(activeSystemPrompt, variables);

  // 会話の取得または作成
  let conversationId = body.conversation_id;
  if (!conversationId) {
    const { data: conv } = await supabase
      .from("conversations")
      .insert({
        agent_id: agentId,
        user_id: user.id,
        last_message_preview: body.input.slice(0, 100),
      })
      .select("id")
      .single();
    conversationId = conv?.id ?? undefined;
  }

  // 実行ログの作成
  const { data: log } = await supabase
    .from("execution_logs")
    .insert({
      agent_id: agentId,
      conversation_id: conversationId ?? null,
      workspace_id: agent.workspace_id,
      user_id: user.id,
      status: "running",
      input: body.input,
      model: agent.model,
      variables_used: Object.keys(variables).length > 0 ? variables : null,
    })
    .select("id")
    .single();

  const logId = log?.id;
  const startedAt = Date.now();

  // 入力ガードレールチェック（logId確定後）
  if (guardrails) {
    const inputCheck = checkInputGuardrails(body.input, guardrails);
    if (!inputCheck.passed && guardrails.mode === "block") {
      const highSeverity = inputCheck.violations.some((v) => v.severity === "high");
      if (highSeverity) {
        if (logId) {
          await supabase.from("execution_logs").update({
            status: "error",
            error_message: `ガードレール: ${inputCheck.violations.map((v) => v.detail).join("; ")}`,
            ended_at: new Date().toISOString(),
          }).eq("id", logId);
        }
        return NextResponse.json<ApiError>(
          { error: "入力が安全ポリシーに違反しています", code: "GUARDRAIL_BLOCKED", details: { violations: inputCheck.violations } },
          { status: 400 }
        );
      }
    }
  }

  // ストリーミングモード（デフォルト）
  const useStream = body.stream !== false;

  // ワークスペースIDを取得（APIキー解決用）
  let workspaceId = auth.workspaceId;
  if (!workspaceId) {
    workspaceId = agent.workspace_id;
  }

  // コスト上限チェック
  const costCheck = await checkCostLimit(workspaceId ?? agent.workspace_id);
  if (!costCheck.allowed) {
    if (logId) {
      await supabase.from("execution_logs").update({
        status: "error", error_message: "月間コスト上限超過", ended_at: new Date().toISOString(),
      }).eq("id", logId);
    }
    return NextResponse.json<ApiError>(
      {
        error: "月間コスト上限に達しました",
        code: "COST_LIMIT_EXCEEDED",
        details: { currentUsd: costCheck.currentUsd, limitUsd: costCheck.limitUsd, percentUsed: costCheck.percentUsed },
      },
      { status: 429 }
    );
  }

  let provider;
  try {
    provider = await getAIProvider(agent.model, workspaceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AIプロバイダーの初期化に失敗しました";
    if (logId) {
      await supabase.from("execution_logs").update({
        status: "error", error_message: msg, ended_at: new Date().toISOString(),
      }).eq("id", logId);
    }
    return NextResponse.json<ApiError>(
      { error: msg, code: "PROVIDER_ERROR" },
      { status: 400 }
    );
  }

  // RAG: ナレッジベースから関連コンテキストを取得してプロンプトに注入
  let ragEnhancedPrompt = expandedPrompt;
  try {
    const ragContext = await getRagContext(agentId, body.input, workspaceId ?? agent.workspace_id);
    if (ragContext) {
      ragEnhancedPrompt = expandedPrompt + "\n\n" + ragContext;
    }
  } catch {
    // RAG失敗時はオリジナルプロンプトで続行
  }

  // 長期メモリ: 関連メモリを検索してプロンプトに注入
  try {
    const memories = await retrieveRelevantMemories(agentId, user.id, body.input, workspaceId ?? agent.workspace_id);
    const memoryContext = buildMemoryContext(memories);
    if (memoryContext) {
      ragEnhancedPrompt += memoryContext;
    }
  } catch {
    // メモリ検索失敗時は続行
  }

  if (useStream) {
    // SSEストリーミングレスポンス
    const stream = new ReadableStream({
      async start(controller) {
        let outputText = "";
        let inputTokens = 0;
        let outputTokens = 0;

        // コスト警告をストリーム先頭で送信
        if (costCheck.isWarning) {
          controller.enqueue(encodeSSE({
            type: "cost_warning" as StreamEvent["type"],
            content: `コスト警告: 月間上限の${Math.round(costCheck.percentUsed)}%に達しています (${costCheck.currentUsd.toFixed(4)} / ${costCheck.limitUsd.toFixed(2)} USD)`,
          }));
        }

        try {
          const result = await provider.chatStream(
            {
              model: agent.model,
              maxTokens: agent.max_tokens,
              systemPrompt: ragEnhancedPrompt,
              temperature: agent.temperature,
              messages: [{ role: "user", content: body.input, images: body.images }],
            },
            (delta) => {
              if (delta.type === "text_delta" && delta.text) {
                outputText += delta.text;
                const sseEvent: StreamEvent = {
                  type: "text_delta",
                  content: delta.text,
                };
                controller.enqueue(encodeSSE(sseEvent));
              }
              if (delta.type === "done") {
                inputTokens = delta.inputTokens ?? 0;
                outputTokens = delta.outputTokens ?? 0;
              }
            }
          );

          inputTokens = result.inputTokens;
          outputTokens = result.outputTokens;

          // 出力ガードレールチェック（ストリーミング完了後）
          let finalOutput = outputText;
          if (guardrails && outputText) {
            const outputCheck = checkOutputGuardrails(outputText, guardrails);
            if (!outputCheck.passed && outputCheck.sanitizedContent) {
              finalOutput = outputCheck.sanitizedContent;
            }
          }

          const costUsd = estimateCost(agent.model, inputTokens, outputTokens);
          const latencyMs = Date.now() - startedAt;

          // 完了イベントを送信
          const doneEvent: StreamEvent = {
            type: "done",
            usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
          };
          controller.enqueue(encodeSSE(doneEvent));

          // ログを更新
          if (logId) {
            await supabase.from("execution_logs").update({
              status: "success",
              output: finalOutput,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cost_usd: costUsd,
              latency_ms: latencyMs,
              ended_at: new Date().toISOString(),
            }).eq("id", logId);
          }

          // メッセージを保存（画像添付含む）
          if (conversationId) {
            const userAttachments = body.images?.map((img) => ({
              type: "image" as const,
              mimeType: img.mimeType,
              data: img.base64,
            })) ?? null;
            await supabase.from("messages").insert([
              {
                conversation_id: conversationId,
                role: "user" as const,
                content: body.input,
                attachments: userAttachments,
              },
              {
                conversation_id: conversationId,
                role: "assistant" as const,
                content: outputText,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
              },
            ]);
            await supabase.from("conversations").update({
              last_message_preview: outputText.slice(0, 100),
              updated_at: new Date().toISOString(),
            }).eq("id", conversationId);
          }

          // メモリ自動抽出（非同期、レスポンスをブロックしない）
          extractMemoriesFromConversation(
            agentId, user.id, body.input, finalOutput,
            workspaceId ?? agent.workspace_id, conversationId
          ).catch(() => {/* サイレント */});
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "不明なエラー";
          const errorEvent: StreamEvent = { type: "error", error: errorMessage };
          controller.enqueue(encodeSSE(errorEvent));

          if (logId) {
            await supabase.from("execution_logs").update({
              status: "error",
              error_message: errorMessage,
              ended_at: new Date().toISOString(),
            }).eq("id", logId);
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Log-Id": logId ?? "",
        "X-Conversation-Id": conversationId ?? "",
      },
    });
  }

  // 非ストリーミングモード — ツール実行ループ対応
  try {
    const agentTools = agent.agent_tools?.filter((t: { enabled: boolean }) => t.enabled) ?? [];
    const toolDefs = buildToolDefinitions(agentTools);
    const hasTools = toolDefs.length > 0;

    // Google APIキー取得（画像生成ツール用）
    const googleApiKey = await resolveGoogleApiKey(workspaceId ?? agent.workspace_id);
    const toolContext = { workspaceId: workspaceId ?? agent.workspace_id, googleApiKey: googleApiKey ?? undefined };

    let outputText = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const allToolCalls: Array<{ name: string; input: Record<string, unknown>; output: string }> = [];

    // ツールがある場合: chatWithTools ループ
    if (hasTools && "chatWithTools" in provider) {
      const chatWithToolsProvider = provider as { chatWithTools: typeof AnthropicProvider.prototype.chatWithTools };
      const MAX_TOOL_ROUNDS = 5;
      const isAnthropic = agent.model.startsWith("claude-");

      // メッセージ配列を構築（画像添付対応）
      const messages: Array<{ role: string; content: unknown; images?: Array<{ base64: string; mimeType: string }> }> = [
        { role: "user", content: body.input, images: body.images },
      ];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await chatWithToolsProvider.chatWithTools(
          { model: agent.model, maxTokens: agent.max_tokens, systemPrompt: ragEnhancedPrompt, temperature: agent.temperature, messages: messages as Array<{ role: "user" | "assistant"; content: string }> },
          toolDefs,
        );

        totalInputTokens += response.inputTokens;
        totalOutputTokens += response.outputTokens;

        if (response.toolCalls.length === 0) {
          outputText = response.output;
          break;
        }

        // ツールを実行
        const toolOutputs: Array<{ id: string; name: string; result: string }> = [];
        for (const tc of response.toolCalls) {
          const result = await executeTool(tc.name, tc.input, toolContext);
          allToolCalls.push({ name: tc.name, input: tc.input, output: result.output });
          toolOutputs.push({ id: tc.id, name: tc.name, result: result.success ? result.output : `エラー: ${result.error}` });
        }

        if (isAnthropic) {
          // Anthropic形式: assistant content → user tool_result
          const assistantContent: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> = [];
          if (response.output) assistantContent.push({ type: "text", text: response.output });
          for (const tc of response.toolCalls) {
            assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
          }
          messages.push({ role: "assistant", content: assistantContent });
          messages.push({ role: "user", content: toolOutputs.map((to) => ({ type: "tool_result", tool_use_id: to.id, content: to.result })) });
        } else {
          // Gemini形式: ツール結果をテキストとしてフォローアップ
          const toolSummary = toolOutputs.map((to) => `[${to.name}の結果]\n${to.result}`).join("\n\n");
          messages.push({ role: "assistant", content: response.output || "ツールを実行しました。" });
          messages.push({ role: "user", content: `以下はツール実行の結果です。この結果をもとに回答してください。\n\n${toolSummary}` });
        }
      }
    } else {
      // ツールなし: 通常のチャット
      const result = await provider.chat({
        model: agent.model,
        maxTokens: agent.max_tokens,
        systemPrompt: ragEnhancedPrompt,
        temperature: agent.temperature,
        messages: [{ role: "user", content: body.input, images: body.images }],
      });
      outputText = result.output;
      totalInputTokens = result.inputTokens;
      totalOutputTokens = result.outputTokens;
    }

    // Structured Output: スキーマバリデーション + リトライ
    let schemaValid: boolean | undefined;
    if (agent.output_schema && outputText) {
      const MAX_RETRIES = 2;
      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        const validation = validateAgentOutput(outputText, agent.output_schema as Record<string, unknown>);
        if (validation.valid) {
          schemaValid = true;
          break;
        }
        if (retry === MAX_RETRIES) {
          schemaValid = false;
          if (agent.output_schema_strict) {
            // 厳密モード: エラーとして返す
            const costUsd = estimateCost(agent.model, totalInputTokens, totalOutputTokens);
            if (logId) {
              await supabase.from("execution_logs").update({
                status: "error",
                output: outputText,
                error_message: `出力スキーマバリデーション失敗: ${validation.errors.join("; ")}`,
                input_tokens: totalInputTokens, output_tokens: totalOutputTokens,
                cost_usd: costUsd, latency_ms: Date.now() - startedAt,
                ended_at: new Date().toISOString(),
              }).eq("id", logId);
            }
            return NextResponse.json<ApiError>(
              { error: "出力がスキーマに準拠していません", code: "SCHEMA_VALIDATION_FAILED", details: { errors: validation.errors } },
              { status: 422 }
            );
          }
          break;
        }
        // リトライ: 修正プロンプトで再実行
        const retryPrompt = buildRetryPrompt(outputText, validation.errors, agent.output_schema as Record<string, unknown>);
        const retryResult = await provider.chat({
          model: agent.model, maxTokens: agent.max_tokens,
          systemPrompt: ragEnhancedPrompt, temperature: agent.temperature,
          messages: [{ role: "user", content: body.input }, { role: "assistant", content: outputText }, { role: "user", content: retryPrompt }],
        });
        outputText = retryResult.output;
        totalInputTokens += retryResult.inputTokens;
        totalOutputTokens += retryResult.outputTokens;
      }
    }

    // 出力ガードレールチェック（非ストリーミング）
    if (guardrails && outputText) {
      const outputCheck = checkOutputGuardrails(outputText, guardrails);
      if (!outputCheck.passed) {
        if (outputCheck.sanitizedContent) {
          outputText = outputCheck.sanitizedContent;
        }
        if (guardrails.mode === "block" && outputCheck.violations.some((v) => v.severity === "high")) {
          const costUsd = estimateCost(agent.model, totalInputTokens, totalOutputTokens);
          if (logId) {
            await supabase.from("execution_logs").update({
              status: "error",
              output: outputText,
              error_message: `出力ガードレール: ${outputCheck.violations.map((v) => v.detail).join("; ")}`,
              input_tokens: totalInputTokens, output_tokens: totalOutputTokens,
              cost_usd: costUsd, latency_ms: Date.now() - startedAt,
              ended_at: new Date().toISOString(),
            }).eq("id", logId);
          }
          return NextResponse.json<ApiError>(
            { error: "出力が安全ポリシーに違反しています", code: "OUTPUT_GUARDRAIL_BLOCKED", details: { violations: outputCheck.violations } },
            { status: 400 }
          );
        }
      }
    }

    const costUsd = estimateCost(agent.model, totalInputTokens, totalOutputTokens);
    const latencyMs = Date.now() - startedAt;

    if (logId) {
      await supabase.from("execution_logs").update({
        status: "success",
        output: outputText,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd: costUsd,
        latency_ms: latencyMs,
        ended_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    // 画像生成エージェント: 自動画像生成（ツールで生成済みでなければ）
    const agentTags: string[] = agent.tags ?? [];
    const isImageAgent = agentTags.some((t: string) =>
      ["画像生成", "image", "image_generation", "画像"].includes(t.toLowerCase())
    );
    const hasImageToolCall = allToolCalls.some((tc) => tc.name === "image_generation");

    if (isImageAgent && !hasImageToolCall) {
      try {
        const imageResult = await autoGenerateImage(outputText, body.input, workspaceId ?? agent.workspace_id);
        if (imageResult) {
          return NextResponse.json({
            output: outputText,
            image_base64: imageResult.imageBase64,
            mime_type: imageResult.mimeType,
            conversation_id: conversationId,
            log_id: logId,
            latency_ms: Date.now() - startedAt,
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            cost_usd: costUsd,
            tool_calls: allToolCalls.map((tc) => ({ name: tc.name, output: tc.output.slice(0, 200) })),
          });
        }
      } catch { /* fallback to text */ }
    }

    return NextResponse.json({
      output: outputText,
      conversation_id: conversationId,
      log_id: logId,
      latency_ms: latencyMs,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: costUsd,
      tool_calls: allToolCalls.length > 0 ? allToolCalls.map((tc) => ({ name: tc.name, output: tc.output.slice(0, 500) })) : undefined,
      schema_valid: schemaValid,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "不明なエラー";
    if (logId) {
      await supabase.from("execution_logs").update({
        status: "error",
        error_message: errorMessage,
        ended_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    return NextResponse.json<ApiError>(
      { error: `エージェント実行に失敗しました: ${errorMessage}`, code: "EXECUTION_ERROR" },
      { status: 500 }
    );
  }
}

// ============================================================
// 画像自動生成: 画像生成タグを持つエージェントは常に画像生成を試みる
// ============================================================

/**
 * AIの出力テキストから画像プロンプトを抽出する。
 * 抽出失敗時はユーザーの元の入力をフォールバックとして返す。
 */
function extractImagePrompt(aiOutput: string, userInput: string): string {
  // 1. コードブロック内のプロンプト
  const codeBlockMatch = aiOutput.match(/```(?:text|prompt)?\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    const prompt = codeBlockMatch[1].trim();
    if (prompt.length > 10) return prompt;
  }

  // 2. 【生成プロンプト】等のラベル後
  const labelMatch = aiOutput.match(/(?:生成プロンプト|Prompt|プロンプト)[】:\s]*\n?```?\n?([\s\S]*?)(?:\n```|\n\n【|\n\n\*\*|$)/i);
  if (labelMatch) {
    const prompt = labelMatch[1].trim();
    if (prompt.length > 10) return prompt;
  }

  // 3. 英語の長い文（プロンプトっぽいもの）
  for (const line of aiOutput.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 40 && /^[A-Za-z]/.test(trimmed) && trimmed.includes(",")) {
      return trimmed;
    }
  }

  // 4. フォールバック: ユーザー入力をそのまま画像プロンプトとして使う
  return userInput;
}

/** Google APIキーを解決 */
async function resolveGoogleApiKey(wsId: string): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("provider_api_keys")
      .select("encrypted_key, iv, auth_tag, is_active")
      .eq("workspace_id", wsId)
      .eq("provider", "google")
      .single();
    if (data?.is_active) {
      return decryptApiKey({ encrypted: data.encrypted_key, iv: data.iv, authTag: data.auth_tag });
    }
  } catch { /* silent */ }
  return null;
}

/**
 * 画像生成タグを持つエージェントの場合、常に画像を生成する。
 * AIの出力からプロンプトを抽出し、抽出できなければユーザー入力をそのまま使う。
 */
async function autoGenerateImage(
  aiOutput: string,
  userInput: string,
  workspaceId: string
): Promise<{ imageBase64: string; mimeType: string } | null> {
  const apiKey = await resolveGoogleApiKey(workspaceId);
  if (!apiKey) return null;

  const prompt = extractImagePrompt(aiOutput, userInput);
  const provider = new GoogleProvider(apiKey);
  const result = await provider.generateImage({
    prompt,
    aspectRatio: "16:9",
    imageSize: "1K",
  });

  return { imageBase64: result.imageBase64, mimeType: result.mimeType };
}
