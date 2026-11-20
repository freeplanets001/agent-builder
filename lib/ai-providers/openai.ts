/**
 * OpenAI (GPT) プロバイダーアダプター
 */
import OpenAI from "openai";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  OnStreamDelta,
} from "./types";

export class OpenAIProvider implements AIProvider {
  readonly providerId = "openai" as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      messages: [
        { role: "system" as const, content: request.systemPrompt },
        ...request.messages.map((m) => {
          if (m.images && m.images.length > 0 && m.role === "user") {
            // マルチモーダル: 画像 + テキスト配列
            return {
              role: "user" as const,
              content: [
                ...m.images.map((img) => ({
                  type: "image_url" as const,
                  image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
                })),
                { type: "text" as const, text: m.content },
              ],
            };
          }
          return { role: m.role as "user" | "assistant" | "system", content: m.content };
        }),
      ],
    });

    const output = response.choices[0]?.message?.content ?? "";

    return {
      output,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  }

  async chatStream(
    request: ChatRequest,
    onDelta: OnStreamDelta
  ): Promise<ChatResponse> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system" as const, content: request.systemPrompt },
        ...request.messages.map((m) => {
          if (m.images && m.images.length > 0 && m.role === "user") {
            return {
              role: "user" as const,
              content: [
                ...m.images.map((img) => ({
                  type: "image_url" as const,
                  image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
                })),
                { type: "text" as const, text: m.content },
              ],
            };
          }
          return { role: m.role as "user" | "assistant" | "system", content: m.content };
        }),
      ],
    });

    let output = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        output += text;
        onDelta({ type: "text_delta", text });
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    onDelta({ type: "done", inputTokens, outputTokens });

    return { output, inputTokens, outputTokens };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.chat.completions.create({
        model: "gpt-4o-mini",
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
