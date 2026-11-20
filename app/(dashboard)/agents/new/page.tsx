import { createClient, createServiceRoleClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import AgentForm from "@/components/agents/AgentForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "新しいエージェント" };

export default async function NewAgentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // デフォルトワークスペースを取得（Layoutで作成済み）
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const workspaceId = member?.workspace_id ?? "";

  if (!workspaceId) {
    return (
      <div style={{ padding: "32px", color: "var(--color-error)" }}>
        ワークスペースの初期化に失敗しました。管理者に問い合わせてください。
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "760px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          新しいエージェント
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginTop: "4px" }}>
          システムプロンプトとツールを設定してAIエージェントを作成します
        </p>
      </div>

      <div
        className="glass"
        style={{ padding: "32px", borderRadius: "20px" }}
      >
        <AgentForm workspaceId={workspaceId} />
      </div>
    </div>
  );
}
