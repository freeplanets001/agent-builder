import type { Metadata } from "next";
import Sidebar from "@/components/layout/Sidebar";
import BottomNav from "@/components/layout/BottomNav";
import { createClient, createServiceRoleClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: {
    default: "ダッシュボード",
    template: "%s | Agent Builder",
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ユーザーの初期化（プロファイル・ワークスペースの存在確認）
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!member) {
    const adminSupabase = createServiceRoleClient();
    
    // プロフィール作成を確認
    await adminSupabase.from("profiles").upsert({
      id: user.id,
      email: user.email!,
      full_name: user.user_metadata.full_name || user.email?.split("@")[0],
      avatar_url: user.user_metadata.avatar_url,
    });

    // ワークスペース作成
    const { data: ws } = await adminSupabase.from("workspaces").insert({
      name: "マイワークスペース",
      owner_id: user.id,
      slug: `ws-${user.id.slice(0, 8)}`,
    }).select().single();

    if (ws) {
      // メンバーシップ追加
      await adminSupabase.from("workspace_members").insert({
        workspace_id: ws.id,
        user_id: user.id,
        role: "owner",
      });
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* サイドバー（PCのみ） */}
      <div className="sidebar-desktop">
        <Sidebar />
      </div>

      {/* メインコンテンツ */}
      <main
        className="main-content"
        style={{
          flex: 1,
          marginLeft: "var(--sidebar-width)",
          minHeight: "100vh",
          background: "var(--color-bg)",
          overflowX: "hidden",
        }}
      >
        {children}
      </main>

      {/* ボトムナビ（モバイルのみ） */}
      <BottomNav />
    </div>
  );
}
