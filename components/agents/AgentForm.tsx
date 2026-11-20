"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import type { Agent, CreateAgentRequest, AgentTool, ModelName } from "@/lib/types";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import ModelSelector from "@/components/agents/ModelSelector";
import ToolSelector from "@/components/agents/ToolSelector";

interface KnowledgeBaseOption {
  id: string;
  name: string;
  description: string;
  document_count: number;
  agent_id: string | null;
}

interface AgentFormProps {
  agent?: Agent;           // 編集時は既存エージェントを渡す
  workspaceId: string;
  onSuccess?: (agent: Agent) => void;
}

type FormData = {
  name: string;
  description: string;
  system_prompt: string;
  model: ModelName;
  temperature: number;
  max_tokens: number;
  visibility: "private" | "team" | "public";
  tags: string;
};

type FormErrors = Partial<Record<keyof FormData, string>>;

/** フォームのバリデーション */
function validate(data: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.name.trim()) errors.name = "エージェント名は必須です";
  if (data.name.length > 100) errors.name = "100文字以内にしてください";
  if (!data.system_prompt.trim()) errors.system_prompt = "システムプロンプトは必須です";
  if (data.system_prompt.length > 20000) errors.system_prompt = "20,000文字以内にしてください";
  if (/sk-ant-api|sk-[a-zA-Z0-9]{48}/.test(data.system_prompt)) {
    errors.system_prompt = "システムプロンプトにAPIキーを含めることは禁止されています";
  }
  return errors;
}

export default function AgentForm({ agent, workspaceId, onSuccess }: AgentFormProps) {
  const router = useRouter();
  const isEdit = !!agent;

  const [form, setForm] = useState<FormData>({
    name:          agent?.name ?? "",
    description:   agent?.description ?? "",
    system_prompt: agent?.system_prompt ?? "",
    model:         agent?.model ?? "claude-sonnet-4-6",
    temperature:   agent?.temperature ?? 0.7,
    max_tokens:    agent?.max_tokens ?? 4096,
    visibility:    agent?.visibility ?? "private",
    tags:          agent?.tags?.join(", ") ?? "",
  });
  const [tools, setTools] = useState<AgentTool[]>(agent?.tools ?? []);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // AI支援プロンプト生成
  const [aiPurpose, setAiPurpose] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // ナレッジベース紐づけ
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);

  const fetchKnowledgeBases = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge");
      if (res.ok) {
        const data = await res.json() as { knowledge_bases: KnowledgeBaseOption[] };
        setKnowledgeBases(data.knowledge_bases);
        // 編集時: このエージェントに紐づいているKBを選択状態にする
        if (agent) {
          const linked = data.knowledge_bases
            .filter((kb) => kb.agent_id === agent.id)
            .map((kb) => kb.id);
          setSelectedKbIds(linked);
        }
      }
    } catch { /* silent */ }
  }, [agent]);

  useEffect(() => { fetchKnowledgeBases(); }, [fetchKnowledgeBases]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  /** AIにシステムプロンプトを生成させる */
  async function handleAiGenerate() {
    if (!aiPurpose.trim()) return;
    setIsGenerating(true);
    setServerError(null);
    try {
      const res = await fetch("/api/ai/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: aiPurpose }),
      });
      const data = await res.json() as {
        name?: string;
        description?: string;
        system_prompt?: string;
        tags?: string[];
        suggested_temperature?: number;
        suggested_model?: string;
        error?: string;
      };
      if (!res.ok) {
        setServerError(data.error ?? "AI生成に失敗しました");
        return;
      }
      // 生成結果をフォームに反映
      if (data.name && !form.name) update("name", data.name);
      if (data.description && !form.description) update("description", data.description);
      if (data.system_prompt) update("system_prompt", data.system_prompt);
      if (data.tags && data.tags.length > 0 && !form.tags) update("tags", data.tags.join(", "));
      if (data.suggested_temperature != null) update("temperature", data.suggested_temperature);
      if (data.suggested_model) update("model", data.suggested_model as ModelName);
      setShowAiPanel(false);
      setAiPurpose("");
    } catch {
      setServerError("AI生成中にネットワークエラーが発生しました");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setServerError(null);

    const payload: CreateAgentRequest & { workspace_id: string } = {
      workspace_id: workspaceId,
      name:          form.name.trim(),
      description:   form.description.trim() || null,
      system_prompt: form.system_prompt,
      model:         form.model,
      temperature:   form.temperature,
      max_tokens:    form.max_tokens,
      visibility:    form.visibility,
      tags:          form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      is_active:     true,
    };

    try {
      const url = isEdit ? `/api/agents/${agent.id}` : "/api/agents";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json() as { agent?: Agent; error?: string };

      if (!res.ok) {
        setServerError(data.error ?? "エラーが発生しました");
        return;
      }

      // ナレッジベースの紐づけを更新
      const savedAgentId = data.agent?.id ?? agent?.id;
      if (savedAgentId && selectedKbIds.length >= 0) {
        // まず全KBのagent_idをnullにリセット
        for (const kb of knowledgeBases) {
          if (kb.agent_id === savedAgentId && !selectedKbIds.includes(kb.id)) {
            await fetch(`/api/knowledge/${kb.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agent_id: null }),
            }).catch(() => { /* silent */ });
          }
        }
        // 選択されたKBにagent_idを設定
        for (const kbId of selectedKbIds) {
          await fetch(`/api/knowledge/${kbId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent_id: savedAgentId }),
          }).catch(() => { /* silent */ });
        }
      }

      if (data.agent && onSuccess) {
        onSuccess(data.agent);
      } else {
        router.push("/agents");
      }
    } catch {
      setServerError("ネットワークエラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* サーバーエラー */}
      {serverError && (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.3)",
            color: "var(--color-error)",
            fontSize: "14px",
          }}
        >
          {serverError}
        </div>
      )}

      {/* 基本情報 */}
      <section>
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          基本情報
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Input
            id="agent-name"
            label="エージェント名"
            placeholder="例: カスタマーサポートBot"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            error={errors.name}
            maxLength={100}
            required
          />
          <div>
            <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "6px", display: "block" }}>
              説明（任意）
            </label>
            <textarea
              id="agent-description"
              placeholder="このエージェントの用途や特徴を簡単に説明してください"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={2}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>
        </div>
      </section>

      {/* システムプロンプト */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            システムプロンプト
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAiPanel(!showAiPanel)}
            disabled={isLoading}
          >
            {showAiPanel ? "閉じる" : "AIで生成"}
          </Button>
        </div>

        {/* AI生成パネル */}
        {showAiPanel && (
          <div style={{
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid var(--color-primary)",
            background: "rgba(124,110,242,0.04)",
            marginBottom: "16px",
          }}>
            <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "8px", display: "block" }}>
              エージェントの目的を入力してください
            </label>
            <textarea
              placeholder={"例: ECサイトのカスタマーサポート。注文状況の確認、返品対応、FAQへの回答を行う。丁寧な日本語で対応する。"}
              value={aiPurpose}
              onChange={(e) => setAiPurpose(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "10px",
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
                marginBottom: "12px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAiPanel(false)} disabled={isGenerating}>
                キャンセル
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleAiGenerate}
                loading={isGenerating}
                disabled={!aiPurpose.trim()}
              >
                {isGenerating ? "生成中..." : "プロンプトを生成"}
              </Button>
            </div>
          </div>
        )}

        <div>
          <textarea
            id="system-prompt"
            placeholder={"あなたは親切なアシスタントです。\n\n変数は {{変数名}} の形式で使用できます。\n例: こんにちは、{{user_name}}さん！"}
            value={form.system_prompt}
            onChange={(e) => update("system_prompt", e.target.value)}
            rows={12}
            required
            aria-invalid={!!errors.system_prompt}
            aria-describedby={errors.system_prompt ? "prompt-error" : undefined}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              background: "var(--color-surface-2)",
              border: `1px solid ${errors.system_prompt ? "var(--color-error)" : "var(--color-border)"}`,
              color: "var(--color-text)",
              fontSize: "14px",
              fontFamily: "ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', monospace",
              resize: "vertical",
              outline: "none",
              lineHeight: 1.7,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            {errors.system_prompt ? (
              <p id="prompt-error" role="alert" style={{ color: "var(--color-error)", fontSize: "12px" }}>
                {errors.system_prompt}
              </p>
            ) : (
              <span />
            )}
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              {form.system_prompt.length.toLocaleString()} / 20,000
            </span>
          </div>
        </div>
      </section>

      {/* モデル選択 */}
      <section>
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          モデル設定
        </h2>
        <ModelSelector
          value={form.model}
          onChange={(m) => update("model", m)}
          disabled={isLoading}
        />

        {/* Temperature / Max Tokens */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
          <div>
            <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "8px", display: "block" }}>
              Temperature: {form.temperature}
            </label>
            <input
              id="temperature"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={form.temperature}
              onChange={(e) => update("temperature", parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "var(--color-primary)" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--color-text-muted)" }}>
              <span>正確 (0.0)</span>
              <span>創造的 (1.0)</span>
            </div>
          </div>
          <div>
            <Input
              id="max-tokens"
              label="最大トークン数"
              type="number"
              min={1}
              max={100000}
              value={form.max_tokens}
              onChange={(e) => update("max_tokens", parseInt(e.target.value, 10) || 4096)}
            />
          </div>
        </div>
      </section>

      {/* ツール */}
      <section>
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          ツール
        </h2>
        <ToolSelector
          tools={tools}
          onChange={setTools}
          disabled={isLoading}
        />
      </section>

      {/* 公開設定・タグ */}
      <section>
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          公開設定
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["private", "team", "public"] as const).map((v) => {
              const labels = { private: "🔒 プライベート", team: "👥 チーム", public: "🌐 公開" };
              return (
                <button
                  key={v}
                  id={`visibility-${v}`}
                  type="button"
                  onClick={() => update("visibility", v)}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "8px",
                    border: `1px solid ${form.visibility === v ? "var(--color-primary)" : "var(--color-border)"}`,
                    background: form.visibility === v ? "rgba(124,110,242,0.1)" : "var(--color-surface-2)",
                    color: form.visibility === v ? "var(--color-primary)" : "var(--color-text-muted)",
                    fontSize: "12px",
                    fontWeight: form.visibility === v ? 600 : 400,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  {labels[v]}
                </button>
              );
            })}
          </div>
          <Input
            id="agent-tags"
            label="タグ（カンマ区切り）"
            placeholder="例: サポート, 日本語, GPT"
            value={form.tags}
            onChange={(e) => update("tags", e.target.value)}
            hint="タグはカンマで区切って複数入力できます"
          />
        </div>
      </section>

      {/* ナレッジベース (RAG) */}
      {knowledgeBases.length > 0 && (
        <section>
          <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <BookOpen size={16} style={{ color: "var(--color-primary)" }} />
            ナレッジベース (RAG)
          </h3>
          <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "12px" }}>
            紐づけたナレッジベースの内容が、エージェント実行時に自動的にコンテキストとして注入されます。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {knowledgeBases.map((kb) => {
              const isSelected = selectedKbIds.includes(kb.id);
              const isOtherAgent = kb.agent_id !== null && kb.agent_id !== agent?.id;
              return (
                <label
                  key={kb.id}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 14px", borderRadius: "var(--radius-md)",
                    border: `1px solid ${isSelected ? "var(--color-primary)" : "var(--color-border)"}`,
                    background: isSelected ? "var(--color-primary-light)" : "var(--color-surface)",
                    cursor: isOtherAgent ? "not-allowed" : "pointer",
                    opacity: isOtherAgent ? 0.5 : 1,
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isOtherAgent}
                    onChange={() => {
                      setSelectedKbIds((prev) =>
                        isSelected ? prev.filter((id) => id !== kb.id) : [...prev, kb.id]
                      );
                    }}
                    style={{ accentColor: "var(--color-primary)" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 550, color: "var(--color-text)" }}>
                      {kb.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {kb.document_count ?? 0}ドキュメント
                      {isOtherAgent && " (他のエージェントに紐づけ済み)"}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {/* 送信ボタン */}
      <div style={{ display: "flex", gap: "12px", paddingTop: "8px", borderTop: "1px solid var(--color-border)" }}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          キャンセル
        </Button>
        <Button
          id="submit-agent-btn"
          type="submit"
          variant="primary"
          loading={isLoading}
          style={{ flex: 1 }}
        >
          {isEdit ? "変更を保存" : "エージェントを作成"}
        </Button>
      </div>
    </form>
  );
}
