/**
 * Anthropic (Claude) プロバイダーアダプター
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  OnStreamDelta,
  ToolDefinition,
  ToolCallRequest,
} from "./types";

type AnthropicMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** メッセージを Anthropic API 形式に変換（画像対応） */
function toAnthropicMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.images && m.images.length > 0 && m.role === "user") {
      // マルチモーダル: 画像 + テキストの配列
      const content: Array<
        | { type: "image"; source: { type: "base64"; media_type: AnthropicMediaType; data: string } }
        | { type: "text"; text: string }
      > = [];
      for (const img of m.images) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: img.mimeType as AnthropicMediaType, data: img.base64 },
        });
      }
      content.push({ type: "text", text: m.content });
      return { role: m.role as "user" | "assistant", content };
    }
    return { role: m.role as "user" | "assistant", content: m.content };
  });
}

export class AnthropicProvider implements AIProvider {
  readonly providerId = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: toAnthropicMessages(request.messages),
    });

    const output =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    return {
      output,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  async chatStream(
    request: ChatRequest,
    onDelta: OnStreamDelta
  ): Promise<ChatResponse> {
    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: toAnthropicMessages(request.messages),
    });

    let output = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        output += event.delta.text;
        onDelta({ type: "text_delta", text: event.delta.text });
      }
      if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens;
      }
    }

    const finalMessage = await stream.finalMessage();
    inputTokens = finalMessage.usage.input_tokens;
    outputTokens = finalMessage.usage.output_tokens;

    onDelta({ type: "done", inputTokens, outputTokens });

    return { output, inputTokens, outputTokens };
  }

  /**
   * ツール対応チャット: AIがツール呼び出しを要求した場合に
   * ToolCallRequest を返す（呼び出し元がツールを実行してループする）
   */
  async chatWithTools(
    request: ChatRequest,
    tools: ToolDefinition[],
    toolResultMessages?: Array<{ role: string; content: unknown }>
  ): Promise<{
    output: string;
    toolCalls: ToolCallRequest[];
    inputTokens: number;
    outputTokens: number;
    stopReason: string;
  }> {
    // メッセージ構築
    const messages: Anthropic.MessageParam[] = [];
    for (const m of request.messages) {
      messages.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    }
    // ツール結果メッセージを追加
    if (toolResultMessages) {
      for (const m of toolResultMessages) {
        messages.push(m as Anthropic.MessageParam);
      }
    }

    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    let output = "";
    const toolCalls: ToolCallRequest[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        output += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      output,
      toolCalls,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason ?? "end_turn",
    };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "接続に失敗しました",
      };
    }
  }
}
