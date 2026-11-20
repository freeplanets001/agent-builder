"use client";

import { useEffect, useState, useCallback } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

/** プロバイダー定義 */
const PROVIDERS = [
  {
    id: "anthropic" as const,
    name: "Anthropic",
    description: "Claude (Opus, Sonnet, Haiku)",
    placeholder: "sk-ant-api03-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    color: "#D4A574",
  },
  {
    id: "google" as const,
    name: "Google AI",
    description: "Gemini (Pro, Flash)",
    placeholder: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
    color: "#4285F4",
  },
  {
    id: "openai" as const,
    name: "OpenAI",
    description: "GPT-4o, GPT-4o mini",
    placeholder: "sk-proj-...",
    docsUrl: "https://platform.openai.com/api-keys",
    color: "#10A37F",
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

interface SavedKey {
  id: string;
  provider: ProviderId;
  key_hint: string;
  is_active: boolean;
  last_verified_at: string | null;
}

export default function SettingsPage() {
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([]);
  const [inputKeys, setInputKeys] = useState<Record<ProviderId, string>>({
    anthropic: "",
    google: "",
    openai: "",
  });
  const [loading, setLoading] = useState<Record<ProviderId, boolean>>({
    anthropic: false,
    google: false,
    openai: false,
  });
  const [messages, setMessages] = useState<
    Record<ProviderId, { type: "success" | "error"; text: string } | null>
  >({
    anthropic: null,
    google: null,
    openai: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/settings/api-keys");
      if (!res.ok) return;
      const data = (await res.json()) as { keys: SavedKey[] };
      setSavedKeys(data.keys);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  /** APIキーを保存（接続テスト付き） */
  async function handleSave(providerId: ProviderId) {
    const key = inputKeys[providerId].trim();
    if (!key) return;

    setLoading((prev) => ({ ...prev, [providerId]: true }));
    setMessages((prev) => ({ ...prev, [providerId]: null }));

    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          api_key: key,
          test_connection: true,
        }),
      });

      const data = (await res.json()) as {
        message?: string;
        error?: string;
        details?: string;
      };

      if (!res.ok) {
        setMessages((prev) => ({
          ...prev,
          [providerId]: {
            type: "error" as const,
            text: data.details ?? data.error ?? "保存に失敗しました",
          },
        }));
        return;
      }

      setMessages((prev) => ({
        ...prev,
        [providerId]: {
          type: "success" as const,
          text: data.message ?? "保存しました",
        },
      }));
      setInputKeys((prev) => ({ ...prev, [providerId]: "" }));
      fetchKeys();
    } catch {
      setMessages((prev) => ({
        ...prev,
        [providerId]: { type: "error" as const, text: "通信エラーが発生しました" },
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [providerId]: false }));
    }
  }

  /** APIキーを削除 */
  async function handleDelete(providerId: ProviderId) {
    if (!confirm(`${providerId} のAPIキーを削除しますか？`)) return;

    try {
      const res = await fetch(
        `/api/settings/api-keys?provider=${providerId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setMessages((prev) => ({
          ...prev,
          [providerId]: { type: "success" as const, text: "削除しました" },
        }));
        fetchKeys();
      }
    } catch {
      setMessages((prev) => ({
        ...prev,
        [providerId]: { type: "error" as const, text: "削除に失敗しました" },
      }));
    }
  }

  /** 保存済みキーを取得 */
  function getSavedKey(providerId: ProviderId): SavedKey | undefined {
    return savedKeys.find((k) => k.provider === providerId);
  }

  return (
    <div style={{ padding: "32px", maxWidth: "800px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px" }}
        >
          設定
        </h1>
        <p
          style={{
            color: "var(--color-text-muted)",
            fontSize: "14px",
            marginTop: "4px",
          }}
        >
          AIプロバイダーのAPIキーを管理
        </p>
      </div>

      {isLoading ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: "160px",
                borderRadius: "16px",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                animation: "pulse-glow 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {PROVIDERS.map((provider) => {
            const saved = getSavedKey(provider.id);
            const message = messages[provider.id];
            const isProviderLoading = loading[provider.id];

            return (
              <div
                key={provider.id}
                style={{
                  padding: "24px",
                  borderRadius: "16px",
                  background: "var(--color-surface)",
                  border: `1px solid ${saved ? provider.color + "40" : "var(--color-border)"}`,
                }}
              >
                {/* ヘッダー */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: saved ? provider.color : "var(--color-border)",
                      }}
                    />
                    <div>
                      <h2 style={{ fontSize: "16px", fontWeight: 600 }}>
                        {provider.name}
                      </h2>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {provider.description}
                      </p>
                    </div>
                  </div>

                  {saved && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          background: "rgba(74, 222, 128, 0.1)",
                          color: "#4ade80",
                          fontFamily: "monospace",
                        }}
                      >
                        {saved.key_hint}
                      </span>
                      {saved.last_verified_at && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          検証済
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 入力フォーム */}
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    alignItems: "flex-end",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <Input
                      type="password"
                      placeholder={provider.placeholder}
                      value={inputKeys[provider.id]}
                      onChange={(e) =>
                        setInputKeys((prev) => ({
                          ...prev,
                          [provider.id]: e.target.value,
                        }))
                      }
                      hint={
                        saved
                          ? "新しいキーを入力すると上書きされます"
                          : undefined
                      }
                    />
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    loading={isProviderLoading}
                    disabled={!inputKeys[provider.id].trim()}
                    onClick={() => handleSave(provider.id)}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {saved ? "更新" : "保存"}
                  </Button>
                  {saved && (
                    <Button
                      variant="danger"
                      size="md"
                      onClick={() => handleDelete(provider.id)}
                    >
                      削除
                    </Button>
                  )}
                </div>

                {/* メッセージ */}
                {message && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      background:
                        message.type === "success"
                          ? "rgba(74, 222, 128, 0.1)"
                          : "rgba(248, 113, 113, 0.1)",
                      color:
                        message.type === "success" ? "#4ade80" : "var(--color-error)",
                      border: `1px solid ${
                        message.type === "success"
                          ? "rgba(74, 222, 128, 0.2)"
                          : "rgba(248, 113, 113, 0.2)"
                      }`,
                    }}
                  >
                    {message.text}
                  </div>
                )}

                {/* ドキュメントリンク */}
                <div style={{ marginTop: "12px" }}>
                  <a
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-muted)",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                    }}
                  >
                    APIキーの取得方法
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 注意書き */}
      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          borderRadius: "12px",
          background: "rgba(96, 165, 250, 0.08)",
          border: "1px solid rgba(96, 165, 250, 0.15)",
          fontSize: "13px",
          color: "var(--color-text-muted)",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "var(--color-text)" }}>セキュリティ</strong>
        <br />
        APIキーはAES-256-GCMで暗号化されてデータベースに保存されます。平文での保存は行いません。
        環境変数にAPIキーが設定されている場合、DBに未登録のプロバイダーはそちらがフォールバックとして使用されます。
      </div>
    </div>
  );
}
