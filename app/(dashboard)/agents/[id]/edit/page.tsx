import { createClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import AgentForm from "@/components/agents/AgentForm";
import type { Metadata } from "next";
import type { Agent } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `エージェント編集 #${id.slice(0, 8)}` };
}

export default async function EditAgentPage({ params }: Props) {
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

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .single();

  return (
    <div style={{ padding: "32px", maxWidth: "760px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          エージェントを編集
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
          {agent.name}
        </p>
      </div>

      <div className="glass" style={{ padding: "32px", borderRadius: "20px" }}>
        <AgentForm
          agent={agent as Agent}
          workspaceId={member?.workspace_id ?? agent.workspace_id}
        />
      </div>
    </div>
  );
}
