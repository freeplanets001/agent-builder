"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";

/**
 * ログインページ — GitHub OAuth認証
 */
export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGitHubLogin() {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message ?? "ログインできませんでした");
      setIsLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 0%, rgba(124,110,242,0.12) 0%, var(--color-bg) 70%)",
        padding: "24px",
      }}
    >
      {/* カード */}
      <div
        className="glass animate-in"
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "48px 40px",
          borderRadius: "20px",
          textAlign: "center",
        }}
      >
        {/* ロゴ */}
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: "var(--gradient-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            fontSize: "28px",
          }}
        >
          🤖
        </div>

        <h1
          className="gradient-text"
          style={{
            fontSize: "28px",
            fontWeight: 700,
            marginBottom: "8px",
            letterSpacing: "-0.5px",
          }}
        >
          Agent Builder
        </h1>

        <p
          style={{
            color: "var(--color-text-muted)",
            fontSize: "14px",
            marginBottom: "40px",
            lineHeight: 1.6,
          }}
        >
          AIエージェントをGUIで作成・管理する
          <br />
          開発者向けプラットフォーム
        </p>

        {/* エラー */}
        {error && (
          <div
            style={{
              background: "rgba(248, 113, 113, 0.1)",
              border: "1px solid rgba(248, 113, 113, 0.3)",
              borderRadius: "10px",
              padding: "12px 16px",
              color: "var(--color-error)",
              fontSize: "13px",
              marginBottom: "24px",
              textAlign: "left",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {/* GitHubログインボタン */}
        <button
          id="github-login-btn"
          onClick={handleGitHubLogin}
          disabled={isLoading}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: "12px",
            background: isLoading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            fontSize: "15px",
            fontWeight: 500,
            cursor: isLoading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            transition: "all 0.2s ease",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.2)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)";
          }}
          aria-label="GitHubでログイン"
        >
          {isLoading ? (
            <div className="spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          )}
          {isLoading ? "接続中..." : "GitHubでログイン"}
        </button>

        <p
          style={{
            color: "var(--color-text-muted)",
            fontSize: "12px",
            marginTop: "24px",
          }}
        >
          ログインすることで
          <a href="#" style={{ color: "var(--color-primary)", textDecoration: "none" }}>利用規約</a>
          {" "}と{" "}
          <a href="#" style={{ color: "var(--color-primary)", textDecoration: "none" }}>プライバシーポリシー</a>
          に同意したものとみなします
        </p>
      </div>
    </main>
  );
}
