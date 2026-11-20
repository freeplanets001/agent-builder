"use client";

import { useState, useCallback } from "react";
import { ImageIcon, Download, Loader2, Sparkles, Settings2 } from "lucide-react";
import Button from "@/components/ui/Button";

/** 利用可能なモデル */
const MODELS = [
  { id: "gemini-2.5-flash-image", label: "Flash (高速)", description: "低コスト・高速" },
  { id: "gemini-3-pro-image-preview", label: "NanobananaPro (高品質)", description: "最高品質" },
  { id: "gemini-3.1-flash-image-preview", label: "Flash 3.1 (最新)", description: "最新モデル" },
] as const;

const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"] as const;
const IMAGE_SIZES = ["1K", "2K", "4K"] as const;

interface GeneratedImage {
  id: string;
  prompt: string;
  imageDataUrl: string;
  model: string;
  latencyMs: number;
  createdAt: Date;
}

export default function ImagePage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(MODELS[0].id);
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [imageSize, setImageSize] = useState<string>("1K");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
        }),
      });

      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        throw new Error(errData.error ?? "画像生成に失敗しました");
      }

      const data = await res.json() as {
        image_base64: string;
        mime_type: string;
        text: string;
        model: string;
        latency_ms: number;
      };

      const generated: GeneratedImage = {
        id: crypto.randomUUID(),
        prompt: prompt.trim(),
        imageDataUrl: `data:${data.mime_type};base64,${data.image_base64}`,
        model: data.model,
        latencyMs: data.latency_ms,
        createdAt: new Date(),
      };

      setCurrentImage(generated);
      setHistory((prev) => [generated, ...prev].slice(0, 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, model, aspectRatio, imageSize, isGenerating]);

  const handleDownload = useCallback(() => {
    if (!currentImage) return;
    const link = document.createElement("a");
    link.href = currentImage.imageDataUrl;
    link.download = `generated-${Date.now()}.png`;
    link.click();
  }, [currentImage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleGenerate();
    }
  }, [handleGenerate]);

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{
          fontSize: "24px", fontWeight: 700, color: "var(--color-text)",
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          <ImageIcon size={28} style={{ color: "var(--color-primary)" }} />
          画像生成
        </h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: "8px", fontSize: "14px" }}>
          Gemini画像生成モデルでテキストから画像を生成します
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* 左: 入力パネル */}
        <div style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border)",
          padding: "24px",
        }}>
          {/* プロンプト入力 */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block", fontSize: "13px", fontWeight: 600,
              color: "var(--color-text-secondary)", marginBottom: "8px",
            }}>
              プロンプト
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="生成したい画像を説明してください... (Cmd+Enter で生成)"
              rows={5}
              style={{
                width: "100%", padding: "12px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)", background: "var(--color-bg)",
                color: "var(--color-text)", fontSize: "14px", fontFamily: "inherit",
                resize: "vertical", outline: "none",
              }}
            />
          </div>

          {/* 設定トグル */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "none", border: "none", color: "var(--color-text-muted)",
              fontSize: "13px", cursor: "pointer", marginBottom: "16px", fontFamily: "inherit",
            }}
          >
            <Settings2 size={14} />
            詳細設定 {showSettings ? "▲" : "▼"}
          </button>

          {showSettings && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px",
              padding: "16px", background: "var(--color-bg)", borderRadius: "var(--radius-md)",
            }}>
              {/* モデル選択 */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                  モデル
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{
                    width: "100%", padding: "8px", borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)", background: "var(--color-surface)",
                    color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit",
                  }}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} — {m.description}</option>
                  ))}
                </select>
              </div>

              {/* アスペクト比 */}
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                  アスペクト比
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  style={{
                    width: "100%", padding: "8px", borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)", background: "var(--color-surface)",
                    color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit",
                  }}
                >
                  {ASPECT_RATIOS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* 画像サイズ */}
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                  サイズ
                </label>
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value)}
                  style={{
                    width: "100%", padding: "8px", borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)", background: "var(--color-surface)",
                    color: "var(--color-text)", fontSize: "13px", fontFamily: "inherit",
                  }}
                >
                  {IMAGE_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 生成ボタン */}
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            style={{ width: "100%" }}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                生成中...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                画像を生成
              </>
            )}
          </Button>

          {error && (
            <div style={{
              marginTop: "12px", padding: "12px", borderRadius: "var(--radius-md)",
              background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", fontSize: "13px",
            }}>
              {error}
            </div>
          )}
        </div>

        {/* 右: プレビュー */}
        <div style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--color-border)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "16px",
          }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              プレビュー
            </span>
            {currentImage && (
              <button
                onClick={handleDownload}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "none", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)", padding: "6px 12px",
                  color: "var(--color-text-secondary)", fontSize: "12px",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <Download size={14} />
                ダウンロード
              </button>
            )}
          </div>

          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: "400px", borderRadius: "var(--radius-md)",
            background: "var(--color-bg)", overflow: "hidden",
          }}>
            {isGenerating ? (
              <div style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
                <Loader2 size={40} style={{ animation: "spin 1s linear infinite", marginBottom: "12px" }} />
                <p style={{ fontSize: "14px" }}>画像を生成しています...</p>
              </div>
            ) : currentImage ? (
              <img
                src={currentImage.imageDataUrl}
                alt={currentImage.prompt}
                style={{ maxWidth: "100%", maxHeight: "500px", objectFit: "contain", borderRadius: "var(--radius-sm)" }}
              />
            ) : (
              <div style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
                <ImageIcon size={48} style={{ opacity: 0.3, marginBottom: "12px" }} />
                <p style={{ fontSize: "14px" }}>プロンプトを入力して画像を生成</p>
              </div>
            )}
          </div>

          {/* メタ情報 */}
          {currentImage && (
            <div style={{
              marginTop: "12px", padding: "8px 12px", borderRadius: "var(--radius-sm)",
              background: "var(--color-bg)", fontSize: "12px", color: "var(--color-text-muted)",
              display: "flex", gap: "16px",
            }}>
              <span>モデル: {currentImage.model}</span>
              <span>レイテンシ: {(currentImage.latencyMs / 1000).toFixed(1)}s</span>
            </div>
          )}
        </div>
      </div>

      {/* 履歴 */}
      {history.length > 1 && (
        <div style={{ marginTop: "32px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text)", marginBottom: "16px" }}>
            生成履歴
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
            {history.slice(1).map((img) => (
              <button
                key={img.id}
                onClick={() => setCurrentImage(img)}
                style={{
                  background: "var(--color-surface)",
                  border: `1px solid ${currentImage?.id === img.id ? "var(--color-primary)" : "var(--color-border)"}`,
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <img
                  src={img.imageDataUrl}
                  alt={img.prompt}
                  style={{ width: "100%", height: "140px", objectFit: "cover" }}
                />
                <div style={{ padding: "8px", fontSize: "11px", color: "var(--color-text-muted)", textAlign: "left" }}>
                  {img.prompt.slice(0, 50)}{img.prompt.length > 50 ? "..." : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
