"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Bot, RefreshCw } from "lucide-react";
import type { Agent } from "@/lib/types";
import AgentCard from "@/components/agents/AgentCard";
import Button from "@/components/ui/Button";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/agents?${params}`);
      if (!res.ok) throw new Error("エージェントの取得に失敗しました");
      const data = await res.json() as { agents: Agent[]; total: number };
      setAgents(data.agents);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchAgents, 300);
    return () => clearTimeout(timer);
  }, [fetchAgents]);

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }

  return (
    <div style={{ padding: "36px 40px", maxWidth: "1280px" }}>

      {/* ページヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "32px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 750, letterSpacing: "-0.03em", color: "var(--color-text)" }}>
            エージェント
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "13.5px", marginTop: "4px" }}>
            {isLoading ? "読み込み中..." : `${total}件のエージェント`}
          </p>
        </div>

        <Link href="/agents/new" id="create-agent-btn">
          <Button variant="primary" icon={<Plus size={16} strokeWidth={2.5} />}>
            新しいエージェント
          </Button>
        </Link>
      </div>

      {/* 検索バー */}
      <div style={{ maxWidth: "420px", marginBottom: "28px", position: "relative" }}>
        <Search
          size={15}
          style={{
            position: "absolute",
            left: "14px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-text-muted)",
            pointerEvents: "none",
          }}
        />
        <input
          id="search-agents"
          placeholder="名前・説明で検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 14px 10px 40px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            fontSize: "13.5px",
            fontFamily: "inherit",
            outline: "none",
            transition: "border-color 0.2s ease",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
        />
      </div>

      {/* エラー */}
      {error && (
        <div
          role="alert"
          style={{
            padding: "14px 18px",
            borderRadius: "var(--radius-md)",
            background: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.15)",
            color: "var(--color-error)",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "13.5px",
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchAgents} icon={<RefreshCw size={13} />}>
            再試行
          </Button>
        </div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "18px",
          }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: "240px" }}
            />
          ))}
        </div>
      )}

      {/* 空状態 */}
      {!isLoading && !error && agents.length === 0 && (
        <div
          className="animate-in"
          style={{
            textAlign: "center",
            padding: "80px 24px",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <Bot size={32} color="var(--color-text-muted)" />
          </div>
          <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", color: "var(--color-text)" }}>
            {search ? "エージェントが見つかりません" : "まだエージェントがありません"}
          </h2>
          <p style={{ fontSize: "13.5px", color: "var(--color-text-muted)", marginBottom: "28px" }}>
            {search
              ? "別のキーワードで検索してみてください"
              : "最初のAIエージェントを作成しましょう"}
          </p>
          {!search && (
            <Link href="/agents/new">
              <Button variant="primary" icon={<Plus size={16} strokeWidth={2.5} />}>
                エージェントを作成する
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* エージェントグリッド */}
      {!isLoading && agents.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "18px",
          }}
        >
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
