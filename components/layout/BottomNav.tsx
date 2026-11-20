"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/agents",      icon: "🤖", label: "エージェント" },
  { href: "/automations", icon: "🔄", label: "自動化" },
  { href: "/logs",        icon: "📋", label: "ログ" },
  { href: "/analytics",   icon: "📊", label: "分析" },
  { href: "/mcp",         icon: "⚡", label: "MCP" },
] as const;

/** モバイル用ボトムナビゲーション（768px以下で表示） */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="モバイルナビゲーション"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "64px",
        background: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        display: "none",
        zIndex: 50,
      }}
      className="bottom-nav"
    >
      <style>{`
        @media (max-width: 768px) {
          .bottom-nav { display: flex !important; }
          .sidebar-desktop { display: none !important; }
          .main-content { margin-left: 0 !important; padding-bottom: 80px !important; }
        }
      `}</style>
      {NAV_ITEMS.map(({ href, icon, label }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              textDecoration: "none",
              color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
              fontSize: "10px",
              fontWeight: isActive ? 600 : 400,
              transition: "color 0.15s ease",
            }}
          >
            <span style={{ fontSize: "20px" }}>{icon}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
