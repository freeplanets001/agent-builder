"use client";

import type { ModelName } from "@/lib/types";

interface ModelSelectorProps {
  value: ModelName;
  onChange: (model: ModelName) => void;
  disabled?: boolean;
}

const MODEL_GROUPS = [
  {
    group: "Claude (Anthropic)",
    models: [
      { value: "claude-sonnet-4-6",          label: "Claude Sonnet 4.6",  desc: "最新・高性能バランス (推奨)", badge: "⭐" },
      { value: "claude-opus-4-6",            label: "Claude Opus 4.6",    desc: "最高性能・1Mコンテキスト" },
      { value: "claude-haiku-4-5",           label: "Claude Haiku 4.5",   desc: "高速・低コスト" },
      { value: "claude-sonnet-4-5",          label: "Claude Sonnet 4.5",  desc: "高性能・バランス重視" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet",  desc: "レガシー" },
    ],
  },
  {
    group: "OpenAI",
    models: [
      { value: "gpt-4o",      label: "GPT-4o",      desc: "マルチモーダル対応" },
      { value: "gpt-4o-mini", label: "GPT-4o mini", desc: "高速・低コスト" },
    ],
  },
  {
    group: "Google",
    models: [
      { value: "gemini-2.5-pro",   label: "Gemini 2.5 Pro",   desc: "高性能・長文コンテキスト" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "高速推論" },
    ],
  },
] as const;

export default function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  return (
    <div>
      <label
        style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "8px", display: "block" }}
      >
        モデル
      </label>
      <div style={{ display: "grid", gap: "8px" }}>
        {MODEL_GROUPS.map(({ group, models }) => (
          <div key={group}>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "6px", padding: "0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {group}
            </div>
            <div style={{ display: "grid", gap: "4px" }}>
              {models.map((model) => {
                const isSelected = value === model.value;
                return (
                  <button
                    key={model.value}
                    id={`model-${model.value}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(model.value as ModelName)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border: `1px solid ${isSelected ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: isSelected ? "rgba(124,110,242,0.1)" : "var(--color-surface-2)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      textAlign: "left",
                      width: "100%",
                      fontFamily: "inherit",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {/* ラジオインジケーター */}
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        border: `2px solid ${isSelected ? "var(--color-primary)" : "var(--color-border)"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isSelected && (
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--color-primary)" }} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text)" }}>
                          {model.label}
                        </span>
                        {"badge" in model && (
                          <span style={{ fontSize: "11px" }}>{(model as { badge?: string }).badge}</span>
                        )}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "1px" }}>
                        {model.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
