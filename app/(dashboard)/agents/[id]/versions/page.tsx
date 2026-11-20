import { createClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import VersionDashboard from "@/components/agents/VersionDashboard";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `バージョン管理 #${id.slice(0, 8)}` };
}

export default async function VersionsPage({ params }: Props) {
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
          バージョン管理
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
          {agent.name} — 現在 v{agent.version}
        </p>
      </div>
      <VersionDashboard
        agentId={agent.id}
        currentPrompt={agent.system_prompt}
        currentVersion={agent.version}
      />
    </div>
  );
}
