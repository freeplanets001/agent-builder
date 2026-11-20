import { createClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import EvaluationDashboard from "@/components/agents/EvaluationDashboard";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `評価ダッシュボード #${id.slice(0, 8)}` };
}

export default async function EvaluatePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, model, system_prompt, version")
    .eq("id", id)
    .single();

  if (!agent) notFound();

  return (
    <div style={{ padding: "32px", maxWidth: "1200px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          評価ダッシュボード
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
          {agent.name} — v{agent.version} — {agent.model}
        </p>
      </div>
      <EvaluationDashboard agentId={agent.id} agentName={agent.name} />
    </div>
  );
}
