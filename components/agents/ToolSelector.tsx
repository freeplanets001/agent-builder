"use client";

import { useState } from "react";
import type { AgentTool, ToolType } from "@/lib/types";
import Button from "@/components/ui/Button";

interface ToolSelectorProps {
  tools: AgentTool[];
  onChange: (tools: AgentTool[]) => void;
  disabled?: boolean;
}

const TOOL_DEFINITIONS: Array<{ type: ToolType; label: string; icon: string; desc: string }> = [
  { type: "web_search",      label: "Web検索",        icon: "🔍", desc: "インターネット検索を実行する" },
  { type: "code_execution",  label: "コード実行",      icon: "💻", desc: "Pythonコードを実行する" },
  { type: "file_read",       label: "ファイル読み込み", icon: "📂", desc: "ファイルを読み込む" },
  { type: "file_write",      label: "ファイル書き込み", icon: "📝", desc: "ファイルに書き込む" },
  { type: "http_request",    label: "HTTP リクエスト", icon: "🌐", desc: "外部APIにリクエストを送る" },
  { type: "database_query",  label: "DBクエリ",        icon: "🗄️",  desc: "データベースを検索する" },
  { type: "image_generation",label: "画像生成",        icon: "🎨", desc: "AIで画像を生成する" },
  { type: "custom",          label: "カスタムツール",  icon: "⚙️",  desc: "独自のツールを定義する" },
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function ToolSelector({ tools, onChange, disabled }: ToolSelectorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function addTool(toolType: ToolType) {
    const def = TOOL_DEFINITIONS.find((d) => d.type === toolType);
    if (!def) return;
    const newTool: AgentTool = {
      id: generateId(),
      agent_id: "",
      tool_type: toolType,
      tool_name: def.label,
      description: def.desc,
      config: {},
      enabled: true,
      created_at: new Date().toISOString(),
    };
    onChange([...tools, newTool]);
  }

  function removeTool(id: string) {
    onChange(tools.filter((t) => t.id !== id));
  }

  function toggleTool(id: string) {
    onChange(tools.map((t) => t.id === id ? { ...t, enabled: !t.enabled } : t));
  }

  const activeToolTypes = new Set(tools.map((t) => t.tool_type));

  return (
    <div>
      <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "12px", display: "block" }}>
        ツール
      </label>

      {/* 追加済みツール */}
      {tools.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
          {tools.map((tool) => {
            const def = TOOL_DEFINITIONS.find((d) => d.type === tool.tool_type);
            return (
              <div
                key={tool.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                  opacity: tool.enabled ? 1 : 0.5,
                }}
              >
                <span style={{ fontSize: "18px" }}>{def?.icon ?? "⚙️"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>{tool.tool_name}</div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{def?.desc}</div>
                </div>
                {/* 有効/無効トグル */}
                <button
                  type="button"
                  onClick={() => toggleTool(tool.id)}
                  disabled={disabled}
                  style={{
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "none",
                    background: tool.enabled ? "rgba(52,211,153,0.1)" : "rgba(122,122,150,0.1)",
                    color: tool.enabled ? "var(--color-success)" : "var(--color-text-muted)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {tool.enabled ? "有効" : "無効"}
                </button>
                {/* 削除 */}
                <button
                  type="button"
                  onClick={() => removeTool(tool.id)}
                  disabled={disabled}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-text-muted)",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "4px",
                    borderRadius: "4px",
                  }}
                  aria-label={`${tool.tool_name}を削除`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ツール追加グリッド */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px" }}>
        {TOOL_DEFINITIONS.map((def) => {
          const isAdded = activeToolTypes.has(def.type);
          return (
            <button
              key={def.type}
              id={`add-tool-${def.type}`}
              type="button"
              disabled={disabled || isAdded}
              onClick={() => addTool(def.type)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "8px",
                border: `1px solid ${isAdded ? "rgba(124,110,242,0.3)" : "var(--color-border)"}`,
                background: isAdded ? "rgba(124,110,242,0.05)" : "var(--color-surface-2)",
                color: isAdded ? "var(--color-primary)" : "var(--color-text-muted)",
                cursor: isAdded ? "default" : "pointer",
                fontSize: "12px",
                fontFamily: "inherit",
                textAlign: "left",
                opacity: isAdded ? 0.7 : 1,
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: "14px" }}>{def.icon}</span>
              <span>{isAdded ? "✓ " : "+ "}{def.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
