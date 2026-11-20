"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Agent, StreamEvent } from "@/lib/types";
import Button from "@/components/ui/Button";

// 画像制限
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_IMAGE_COUNT = 4;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

interface ImagePreview {
  base64: string;
  mimeType: string;
  name: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  images?: ImagePreview[];
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

interface PlaygroundProps {
  agent: Agent;
  conversationId?: string;
}

/** ファイルをBase64に変換 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/png;base64,... から base64 部分だけ取り出す
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** ファイルをバリデーションしてImagePreviewに変換 */
async function processImageFile(file: File): Promise<ImagePreview | string> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `${file.name}: 対応していない形式です（JPEG, PNG, GIF, WebP のみ）`;
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `${file.name}: ファイルサイズが4MBを超えています`;
  }
  const base64 = await fileToBase64(file);
  return { base64, mimeType: file.type, name: file.name };
}

export default function Playground({ agent, conversationId: initialConvId }: PlaygroundProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [convId, setConvId] = useState<string | undefined>(initialConvId);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingImages, setPendingImages] = useState<ImagePreview[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージ追加時にスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // 画像ファイルの処理
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setImageError(null);
    const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (fileArray.length === 0) return;

    const remaining = MAX_IMAGE_COUNT - pendingImages.length;
    if (remaining <= 0) {
      setImageError(`最大${MAX_IMAGE_COUNT}枚まで添付できます`);
      return;
    }

    const toProcess = fileArray.slice(0, remaining);
    const results = await Promise.all(toProcess.map(processImageFile));

    const newImages: ImagePreview[] = [];
    const errors: string[] = [];

    for (const r of results) {
      if (typeof r === "string") {
        errors.push(r);
      } else {
        newImages.push(r);
      }
    }

    if (errors.length > 0) {
      setImageError(errors.join("\n"));
    }
    if (newImages.length > 0) {
      setPendingImages((prev) => [...prev, ...newImages]);
    }
  }, [pendingImages.length]);

  // D&Dイベント
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  // ペーストで画像追加
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }
  }, [handleFiles]);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
    setImageError(null);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && pendingImages.length === 0) || isStreaming) return;

    const sentImages = [...pendingImages];
    const messageText = trimmed || "(画像のみ)";

    setMessages((prev) => [...prev, { role: "user", content: messageText, images: sentImages.length > 0 ? sentImages : undefined }]);
    setInput("");
    setPendingImages([]);
    setImageError(null);
    setIsStreaming(true);
    setStreamingContent("");

    try {
      const requestBody: Record<string, unknown> = {
        input: messageText,
        conversation_id: convId,
        stream: true,
      };
      if (sentImages.length > 0) {
        requestBody.images = sentImages.map((img) => ({
          base64: img.base64,
          mimeType: img.mimeType,
        }));
      }

      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `エラー: ${errData.error ?? "不明なエラー"}` },
        ]);
        return;
      }

      // SSEストリームの読み取り
      const newConvId = res.headers.get("X-Conversation-Id");
      if (newConvId) setConvId(newConvId);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let accContent = "";
      let usage = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const event: StreamEvent = JSON.parse(line.replace("data: ", ""));
            if (event.type === "text_delta" && event.content) {
              accContent += event.content;
              setStreamingContent(accContent);
            } else if (event.type === "done" && event.usage) {
              usage = event.usage;
            }
          } catch {
            // parseエラーは無視
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: accContent,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          costUsd: usage.cost_usd,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `${err instanceof Error ? err.message : "エラーが発生しました"}` },
      ]);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [agent.id, convId, input, isStreaming, pendingImages]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    if (messages.length > 0 && window.confirm("会話をリセットしますか？")) {
      setMessages([]);
      setConvId(undefined);
      setPendingImages([]);
      setImageError(null);
    }
  }

  return (
    <div
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "0",
        position: "relative",
      }}
    >
      {/* D&Dオーバーレイ */}
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(99, 102, 241, 0.08)",
            border: "2px dashed var(--color-primary)",
            borderRadius: "12px",
            pointerEvents: "none",
          }}
        >
          <div style={{
            padding: "24px 40px",
            borderRadius: "12px",
            background: "var(--color-surface)",
            boxShadow: "var(--shadow-lg)",
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--color-primary)",
          }}>
            画像をドロップして添付
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: isStreaming ? "var(--color-warning)" : "var(--color-success)",
              animation: isStreaming ? "pulse-glow 1s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ fontSize: "13px", fontWeight: 500 }}>
            {isStreaming ? "応答中..." : "待機中"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
            {agent.model}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClear} disabled={messages.length === 0}>
          クリア
        </Button>
      </div>

      {/* メッセージ一覧 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {messages.length === 0 && !isStreaming && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--color-text-muted)",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>💬</div>
            <p style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}>
              {agent.name}
            </p>
            <p style={{ fontSize: "13px" }}>
              メッセージを入力してエージェントと会話を始めましょう
            </p>
            <p style={{ fontSize: "12px", marginTop: "8px", color: "var(--color-text-muted)" }}>
              画像をドラッグ&ドロップ、またはペーストで添付できます
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              animationDelay: `${i * 0.05}s`,
            }}
            className="animate-in"
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "12px 16px",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: msg.role === "user"
                  ? "var(--gradient-primary)"
                  : "var(--color-surface-2)",
                border: msg.role === "assistant" ? "1px solid var(--color-border)" : "none",
                fontSize: "14px",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {/* ユーザーメッセージ内の画像サムネイル */}
              {msg.images && msg.images.length > 0 && (
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  marginBottom: "8px",
                }}>
                  {msg.images.map((img, j) => (
                    <img
                      key={j}
                      src={`data:${img.mimeType};base64,${img.base64}`}
                      alt={img.name}
                      style={{
                        width: "120px",
                        height: "120px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        // フルサイズ表示（新しいタブ）
                        const dataUrl = `data:${img.mimeType};base64,${img.base64}`;
                        window.open(dataUrl, "_blank");
                      }}
                    />
                  ))}
                </div>
              )}
              {msg.content}
              {/* トークン情報 */}
              {msg.role === "assistant" && (msg.inputTokens || msg.outputTokens) && (
                <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--color-border)", fontSize: "11px", color: "var(--color-text-muted)", display: "flex", gap: "12px" }}>
                  <span>↑ {msg.inputTokens} tokens</span>
                  <span>↓ {msg.outputTokens} tokens</span>
                  {msg.costUsd !== undefined && <span>${(msg.costUsd * 1000).toFixed(3)}m</span>}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* ストリーミング中のアシスタントメッセージ */}
        {isStreaming && streamingContent && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "12px 16px",
                borderRadius: "16px 16px 16px 4px",
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                fontSize: "14px",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {streamingContent}
              <span
                style={{
                  display: "inline-block",
                  width: "2px",
                  height: "14px",
                  background: "var(--color-primary)",
                  marginLeft: "2px",
                  animation: "spin 1s linear infinite",
                  verticalAlign: "text-bottom",
                }}
              />
            </div>
          </div>
        )}

        {/* ローディングアニメーション（テキスト受信前） */}
        {isStreaming && !streamingContent && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "16px 16px 16px 4px",
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                display: "flex",
                gap: "4px",
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--color-primary)",
                    animation: "pulse-glow 1.2s ease-in-out infinite",
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div
        style={{
          padding: "16px 20px",
          borderTop: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        {/* 画像プレビュー */}
        {pendingImages.length > 0 && (
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "12px",
            padding: "10px",
            borderRadius: "10px",
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
          }}>
            {pendingImages.map((img, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt={img.name}
                  style={{
                    width: "64px",
                    height: "64px",
                    objectFit: "cover",
                    borderRadius: "8px",
                    border: "1px solid var(--color-border)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-6px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "var(--color-error, #ef4444)",
                    color: "#fff",
                    border: "2px solid var(--color-surface)",
                    fontSize: "11px",
                    lineHeight: "1",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                  title="削除"
                >
                  ×
                </button>
                <div style={{
                  fontSize: "10px",
                  color: "var(--color-text-muted)",
                  textAlign: "center",
                  marginTop: "2px",
                  maxWidth: "64px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {img.name}
                </div>
              </div>
            ))}
            <div style={{
              display: "flex",
              alignItems: "center",
              fontSize: "11px",
              color: "var(--color-text-muted)",
              paddingLeft: "4px",
            }}>
              {pendingImages.length}/{MAX_IMAGE_COUNT}
            </div>
          </div>
        )}

        {/* 画像エラー */}
        {imageError && (
          <div style={{
            fontSize: "12px",
            color: "var(--color-error, #ef4444)",
            marginBottom: "8px",
            padding: "6px 10px",
            borderRadius: "6px",
            background: "rgba(239, 68, 68, 0.08)",
          }}>
            {imageError}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
          }}
        >
          {/* 画像添付ボタン */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || pendingImages.length >= MAX_IMAGE_COUNT}
            style={{
              flexShrink: 0,
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              color: pendingImages.length >= MAX_IMAGE_COUNT ? "var(--color-text-muted)" : "var(--color-text)",
              fontSize: "18px",
              cursor: pendingImages.length >= MAX_IMAGE_COUNT ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: isStreaming ? 0.5 : 1,
              transition: "background 0.15s",
            }}
            title="画像を添付 (JPEG, PNG, GIF, WebP)"
          >
            🖼️
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) {
                handleFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />

          <textarea
            ref={textareaRef}
            id="playground-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="メッセージを入力... (Cmd/Ctrl+Enter で送信)"
            rows={3}
            disabled={isStreaming}
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: "12px",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              fontSize: "14px",
              fontFamily: "inherit",
              resize: "none",
              outline: "none",
              lineHeight: 1.6,
            }}
          />
          <Button
            id="send-message-btn"
            variant="primary"
            onClick={handleSend}
            disabled={(!input.trim() && pendingImages.length === 0) || isStreaming}
            loading={isStreaming}
            style={{ flexShrink: 0, paddingLeft: "20px", paddingRight: "20px" }}
          >
            送信
          </Button>
        </div>
        <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "8px" }}>
          Cmd/Ctrl + Enter で送信 | 画像: D&D / ペースト / クリックで添付（最大{MAX_IMAGE_COUNT}枚, 各4MB）
        </p>
      </div>
    </div>
  );
}
