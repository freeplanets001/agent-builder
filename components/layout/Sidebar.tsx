"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Bot,
  Brain,
  RefreshCw,
  FileText,
  BarChart3,
  Zap,
  Settings,
  Plus,
  LogOut,
  ImageIcon,
  Store,
  BookOpen,
  HelpCircle,
  GitBranch,
} from "lucide-react";
import type { ReactNode } from "react";

/** ナビゲーション項目の定義 */
const NAV_ITEMS: { href: string; icon: ReactNode; label: string }[] = [
  { href: "/agents",      icon: <Bot size={18} />,       label: "エージェント" },
  { href: "/skills",      icon: <Brain size={18} />,     label: "スキル" },
  { href: "/automations", icon: <RefreshCw size={18} />, label: "自動化" },
  { href: "/pipelines",   icon: <GitBranch size={18} />,  label: "パイプライン" },
  { href: "/image",       icon: <ImageIcon size={18} />, label: "画像生成" },
  { href: "/marketplace", icon: <Store size={18} />,     label: "マーケット" },
  { href: "/knowledge",   icon: <BookOpen size={18} />,   label: "ナレッジ" },
  { href: "/logs",        icon: <FileText size={18} />,  label: "ログ" },
  { href: "/analytics",   icon: <BarChart3 size={18} />, label: "分析" },
  { href: "/mcp",         icon: <Zap size={18} />,       label: "MCP設定" },
  { href: "/settings",    icon: <Settings size={18} />,  label: "設定" },
  { href: "/manual",      icon: <HelpCircle size={18} />, label: "マニュアル" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside
      className="glass"
      style={{
        width: "var(--sidebar-width)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 50,
        borderRight: "1px solid var(--color-border)",
        background: "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
      }}
    >
      {/* ロゴ */}
      <div
        style={{
          padding: "24px 20px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "var(--radius-md)",
            background: "var(--gradient-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "var(--shadow-primary)",
          }}
        >
          <Bot size={20} color="white" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "-0.3px", color: "var(--color-text)" }}>
            Agent Builder
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", letterSpacing: "0.02em" }}>
            v2.0
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <nav style={{ flex: 1, padding: "16px 12px", overflowY: "auto" }} aria-label="メインナビゲーション">
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {NAV_ITEMS.map(({ href, icon, label }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                id={`nav-${label}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  textDecoration: "none",
                  fontSize: "13.5px",
                  fontWeight: isActive ? 600 : 450,
                  color: isActive ? "var(--color-primary)" : "var(--color-text-secondary)",
                  background: isActive ? "var(--color-primary-light)" : "transparent",
                  transition: "all 0.2s ease",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                    transition: "color 0.2s ease",
                  }}
                >
                  {icon}
                </span>
                {label}
                {/* アクティブインジケーター */}
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "3px",
                      height: "20px",
                      borderRadius: "0 3px 3px 0",
                      background: "var(--gradient-primary)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* エージェント作成ボタン */}
      <div style={{ padding: "12px" }}>
        <Link
          href="/agents/new"
          id="new-agent-btn"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "11px",
            borderRadius: "var(--radius-md)",
            background: "var(--gradient-primary)",
            color: "white",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "0.01em",
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
          <Plus size={16} strokeWidth={2.5} />
          新しいエージェント
        </Link>
      </div>

      {/* サインアウト */}
      <div style={{ padding: "12px", borderTop: "1px solid var(--color-border)" }}>
        <button
          id="signout-btn"
          onClick={handleSignOut}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "transparent",
            border: "none",
            color: "var(--color-text-muted)",
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontFamily: "inherit",
            transition: "all 0.2s ease",
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
          }}
        >
          <LogOut size={16} />
          サインアウト
        </button>
      </div>
    </aside>
  );
}
