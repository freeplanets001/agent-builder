/**
 * Google (Gemini) プロバイダーアダプター
 *
 * @google/genai SDK を使用。
 */
import { GoogleGenAI } from "@google/genai";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  ImageGenerateRequest,
  ImageGenerateResponse,
  OnStreamDelta,
  ToolDefinition,
  ToolCallRequest,
} from "./types";

export class GoogleProvider implements AIProvider {
  readonly providerId = "google" as const;
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.models.generateContent({
      model: request.model,
      contents: this.buildContents(request),
      config: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        systemInstruction: request.systemPrompt,
      },
    });

    const output = response.text ?? "";
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    return { output, inputTokens, outputTokens };
  }

  async chatStream(
    request: ChatRequest,
    onDelta: OnStreamDelta
  ): Promise<ChatResponse> {
    const response = await this.client.models.generateContentStream({
      model: request.model,
      contents: this.buildContents(request),
      config: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        systemInstruction: request.systemPrompt,
      },
    });

    let output = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of response) {
      const text = chunk.text ?? "";
      if (text) {
        output += text;
        onDelta({ type: "text_delta", text });
      }
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
        outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
      }
    }

    onDelta({ type: "done", inputTokens, outputTokens });

    return { output, inputTokens, outputTokens };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "ping",
        config: { maxOutputTokens: 10 },
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "接続に失敗しました",
      };
    }
  }

  /**
   * ツール対応チャット（Gemini Function Calling）
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
    // Gemini形式のツール定義に変換
    const geminiTools = tools.length > 0 ? [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      })),
    }] : undefined;

    // メッセージ構築
    const contents = this.buildContents(request);
    // ツール結果があれば追加（Gemini形式）
    const allContents = Array.isArray(contents) ? [...contents] : [{ role: "user", parts: [{ text: contents as string }] }];
    if (toolResultMessages) {
      for (const m of toolResultMessages) {
        allContents.push(m as unknown as { role: string; parts: Array<{ text: string }> });
      }
    }

    const response = await this.client.models.generateContent({
      model: request.model,
      contents: allContents,
      config: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        systemInstruction: request.systemPrompt,
        tools: geminiTools,
      },
    });

    let output = "";
    const toolCalls: ToolCallRequest[] = [];

    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) output += part.text;
        if (part.functionCall) {
          toolCalls.push({
            id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: part.functionCall.name ?? "",
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    return {
      output,
      toolCalls,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
    };
  }

  /**
   * Gemini の画像生成機能で画像を生成する
   * デフォルトモデル: gemini-2.5-flash-image（高速・低コスト）
   * responseModalities に IMAGE を含めることで画像出力を有効化
   */
  async generateImage(
    request: ImageGenerateRequest & { model?: string }
  ): Promise<ImageGenerateResponse> {
    const model = request.model ?? "gemini-2.5-flash-image";

    const response = await this.client.models.generateContent({
      model,
      contents: request.prompt,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: request.aspectRatio ?? "16:9",
          imageSize: request.imageSize ?? "1K",
        },
      },
    });

    let imageBase64 = "";
    let mimeType = "image/png";
    let text = "";

    // レスポンスのパーツからテキストと画像を抽出
    const candidates = response.candidates ?? [];
    for (const candidate of candidates) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) {
          text += part.text;
        }
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType ?? "image/png";
        }
      }
    }

    if (!imageBase64) {
      throw new Error("画像の生成に失敗しました。Gemini APIから画像データが返されませんでした。");
    }

    return { imageBase64, mimeType, text };
  }

  /**
   * 既存画像をテキスト指示で編集する (Image-to-Image)
   */
  async editImage(request: {
    imageBase64: string;
    imageMimeType: string;
    prompt: string;
    model?: string;
  }): Promise<ImageGenerateResponse> {
    const model = request.model ?? "gemini-2.5-flash-image";

    const response = await this.client.models.generateContent({
      model,
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: request.imageBase64, mimeType: request.imageMimeType } },
          { text: request.prompt },
        ],
      }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    let imageBase64 = "";
    let mimeType = "image/png";
    let text = "";

    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) text += part.text;
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          mimeType = part.inlineData.mimeType ?? "image/png";
        }
      }
    }

    if (!imageBase64) {
      throw new Error("画像の編集に失敗しました。Gemini APIから画像データが返されませんでした。");
    }

    return { imageBase64, mimeType, text };
  }

  /** メッセージ配列をGemini形式のcontentsに変換 */
  private buildContents(request: ChatRequest): string | Array<{ role: string; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> }> {
    // 画像がある場合はマルチパート形式
    const hasImages = request.messages.some((m) => m.images && m.images.length > 0);

    if (!hasImages && request.messages.length === 1 && request.messages[0].role === "user") {
      return request.messages[0].content;
    }

    return request.messages.map((m) => {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      // 画像パーツを先に追加
      if (m.images && m.images.length > 0) {
        for (const img of m.images) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        }
      }

      // テキストパーツ
      parts.push({ text: m.content });

      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });
  }
}
