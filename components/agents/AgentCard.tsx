"use client";

import Link from "next/link";
import { Play, Pencil, Trash2, Wrench } from "lucide-react";
import type { Agent } from "@/lib/types";

interface AgentCardProps {
  agent: Agent;
  onDelete?: (id: string) => void;
}

const MODEL_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  "claude-opus-4-6":   { label: "Opus 4.6",   color: "#7c3aed", bg: "rgba(124, 58, 237, 0.08)" },
  "claude-sonnet-4-6": { label: "Sonnet 4.6",  color: "#6366f1", bg: "rgba(99, 102, 241, 0.08)" },
  "claude-haiku-4-5":  { label: "Haiku 4.5",   color: "#0891b2", bg: "rgba(8, 145, 178, 0.08)" },
  "claude-opus-4-5":   { label: "Opus 4.5",    color: "#7c3aed", bg: "rgba(124, 58, 237, 0.08)" },
  "claude-sonnet-4-5": { label: "Sonnet 4.5",  color: "#6366f1", bg: "rgba(99, 102, 241, 0.08)" },
  "claude-3-5-sonnet-20241022": { label: "Sonnet 3.5", color: "#6366f1", bg: "rgba(99, 102, 241, 0.08)" },
  "claude-3-5-haiku-20241022":  { label: "Haiku 3.5",  color: "#0891b2", bg: "rgba(8, 145, 178, 0.08)" },
  "gpt-4o":            { label: "GPT-4o",      color: "#059669", bg: "rgba(5, 150, 105, 0.08)" },
  "gpt-4o-mini":       { label: "GPT-4o mini", color: "#10b981", bg: "rgba(16, 185, 129, 0.08)" },
  "gemini-2.5-pro":    { label: "Gemini Pro",   color: "#2563eb", bg: "rgba(37, 99, 235, 0.08)" },
  "gemini-2.5-flash":  { label: "Gemini Flash", color: "#0284c7", bg: "rgba(2, 132, 199, 0.08)" },
};

const VISIBILITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  private: { label: "Private",  color: "#64748b", bg: "rgba(100, 116, 139, 0.08)" },
  team:    { label: "Team",     color: "#6366f1", bg: "rgba(99, 102, 241, 0.08)" },
  public:  { label: "Public",   color: "#10b981", bg: "rgba(16, 185, 129, 0.08)" },
};

function getProviderDot(model: string): string {
  if (model.startsWith("claude-")) return "#6366f1";
  if (model.startsWith("gemini-")) return "#2563eb";
  if (model.startsWith("gpt-"))    return "#059669";
  return "#94a3b8";
}

export default function AgentCard({ agent, onDelete }: AgentCardProps) {
  const tools = agent.tools ?? [];
  const badge = VISIBILITY_CONFIG[agent.visibility] ?? VISIBILITY_CONFIG.private;
  const modelInfo = MODEL_LABELS[agent.model] ?? { label: agent.model, color: "#64748b", bg: "rgba(100,116,139,0.08)" };

  return (
    <article className="card-gradient animate-in" style={{ padding: "0", overflow: "hidden" }}>
      {/* カード上部 */}
      <div style={{ padding: "22px 22px 16px" }}>
        {/* ヘッダー行 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontSize: "15px",
                fontWeight: 650,
                letterSpacing: "-0.02em",
                color: "var(--color-text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {agent.name}
            </h3>
          </div>
          <span
            className="badge"
            style={{
              color: badge.color,
              background: badge.bg,
              border: `1px solid ${badge.color}18`,
              flexShrink: 0,
            }}
          >
            {badge.label}
          </span>
        </div>

        {/* 説明 */}
        {agent.description && (
          <p
            style={{
              fontSize: "13px",
              lineHeight: 1.6,
              color: "var(--color-text-muted)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              marginBottom: "14px",
            }}
          >
            {agent.description}
          </p>
        )}

        {/* メタ情報バッジ */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: agent.tags.length > 0 ? "12px" : "0" }}>
          <span
            className="badge"
            style={{ color: modelInfo.color, background: modelInfo.bg, border: `1px solid ${modelInfo.color}15` }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: getProviderDot(agent.model), flexShrink: 0 }} />
            {modelInfo.label}
          </span>
          <span
            className="badge"
            style={{ color: "var(--color-text-muted)", background: "var(--color-surface-2)" }}
          >
            v{agent.version}
          </span>
          {tools.length > 0 && (
            <span
              className="badge"
              style={{ color: "var(--color-text-muted)", background: "var(--color-surface-2)" }}
            >
              <Wrench size={11} />
              {tools.length}
            </span>
          )}
        </div>

        {/* タグ */}
        {agent.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {agent.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "2px 10px",
                  borderRadius: "100px",
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                  letterSpacing: "0.01em",
                }}
              >
                {tag}
              </span>
            ))}
            {agent.tags.length > 4 && (
              <span style={{ padding: "2px 9px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                +{agent.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {/* カード下部 — アクション */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          padding: "14px 22px",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface-2)",
        }}
      >
        <Link
          href={`/agents/${agent.id}/play`}
          id={`play-agent-${agent.id}`}
          style={{
            flex: 1,
            padding: "8px",
            borderRadius: "var(--radius-sm)",
            background: "var(--gradient-primary)",
            color: "white",
            textDecoration: "none",
            fontSize: "12px",
            fontWeight: 600,
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            transition: "all 0.2s ease",
            boxShadow: "var(--shadow-primary)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(99, 102, 241, 0.35)";
            (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-primary)";
            (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
          }}
        >
          <Play size={13} fill="white" />
          実行
        </Link>

        <Link
          href={`/agents/${agent.id}/edit`}
          id={`edit-agent-${agent.id}`}
          style={{
            padding: "8px 14px",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
            textDecoration: "none",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            transition: "all 0.2s ease",
            boxShadow: "var(--shadow-xs)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--color-text)";
            (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border-hover)";
            (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)";
            (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
            (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-xs)";
          }}
        >
          <Pencil size={13} />
        </Link>

        {onDelete && (
          <button
            id={`delete-agent-${agent.id}`}
            onClick={() => {
              if (window.confirm(`「${agent.name}」を削除しますか？この操作は取り消せません。`)) {
                onDelete(agent.id);
              }
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              transition: "all 0.2s ease",
              boxShadow: "var(--shadow-xs)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.2)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.04)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface)";
            }}
            aria-label={`${agent.name}を削除`}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </article>
  );
}
