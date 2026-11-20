import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Agent Builder",
    template: "%s | Agent Builder",
  },
  description: "AIエージェントをGUIで作成・管理し、Claude Code経由で呼び出せるWebアプリ",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
