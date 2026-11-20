import { createClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import Playground from "@/components/agents/Playground";
import Link from "next/link";
import type { Metadata } from "next";
import type { Agent } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("agents").select("name").eq("id", id).single();
  return { title: `${data?.name ?? "プレイグラウンド"} — 実行` };
}

export default async function PlaygroundPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("agents")
    .select("*, agent_tools(*), agent_variables(*)")
    .eq("id", id)
    .single();

  if (!agent) notFound();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* ヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px 24px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          flexShrink: 0,
        }}
      >
        <Link
          href="/agents"
          style={{
            color: "var(--color-text-muted)",
            textDecoration: "none",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          ← エージェント一覧
        </Link>
        <span style={{ color: "var(--color-border)" }}>/</span>
        <h1 style={{ fontSize: "16px", fontWeight: 600 }}>{agent.name}</h1>
        <Link
          href={`/agents/${id}/edit`}
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            borderRadius: "8px",
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
            textDecoration: "none",
            fontSize: "12px",
          }}
        >
          ✏️ 編集
        </Link>
      </div>

      {/* プレイグラウンド本体 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Playground agent={agent as Agent} />
      </div>
    </div>
  );
}
