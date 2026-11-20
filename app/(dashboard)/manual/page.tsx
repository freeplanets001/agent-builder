"use client";

import { useState } from "react";
import { BookOpen, Bot, Brain, ImageIcon, Zap, Store, FileText, Search, Settings, BarChart3, RefreshCw, TestTube, Link2 } from "lucide-react";

const SECTIONS = [
  { id: "overview", label: "概要", icon: <BookOpen size={16} /> },
  { id: "getting-started", label: "はじめに", icon: <Zap size={16} /> },
  { id: "agents", label: "エージェント", icon: <Bot size={16} /> },
  { id: "orchestrator", label: "オーケストレーター", icon: <Brain size={16} /> },
  { id: "image", label: "画像生成", icon: <ImageIcon size={16} /> },
  { id: "rag", label: "ナレッジベース (RAG)", icon: <Search size={16} /> },
  { id: "marketplace", label: "マーケットプレイス", icon: <Store size={16} /> },
  { id: "automation", label: "自動化", icon: <RefreshCw size={16} /> },
  { id: "testing", label: "テスト", icon: <TestTube size={16} /> },
  { id: "mcp", label: "MCP連携", icon: <Link2 size={16} /> },
  { id: "settings", label: "設定", icon: <Settings size={16} /> },
  { id: "logs", label: "ログ・分析", icon: <BarChart3 size={16} /> },
  { id: "api", label: "API リファレンス", icon: <FileText size={16} /> },
] as const;

const sectionStyle = {
  marginBottom: "48px",
};
const h2Style: React.CSSProperties = {
  fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em",
  color: "var(--color-text)", marginBottom: "16px",
  paddingBottom: "12px", borderBottom: "2px solid var(--color-primary-light)",
  display: "flex", alignItems: "center", gap: "10px",
};
const h3Style: React.CSSProperties = {
  fontSize: "16px", fontWeight: 650, color: "var(--color-text)",
  marginTop: "28px", marginBottom: "10px",
};
const pStyle: React.CSSProperties = {
  fontSize: "14px", lineHeight: 1.8, color: "var(--color-text-secondary)",
  marginBottom: "12px",
};
const codeStyle: React.CSSProperties = {
  padding: "2px 8px", borderRadius: "6px", fontSize: "13px",
  background: "var(--color-surface-2)", color: "var(--color-primary)",
  fontFamily: "'SF Mono', Menlo, monospace",
};
const codeBlockStyle: React.CSSProperties = {
  padding: "16px", borderRadius: "var(--radius-md)", fontSize: "13px",
  background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
  fontFamily: "'SF Mono', Menlo, monospace", lineHeight: 1.6,
  overflow: "auto", margin: "12px 0", color: "var(--color-text)",
};
const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: "13px", margin: "12px 0",
};
const thStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontWeight: 600,
  borderBottom: "2px solid var(--color-border)", color: "var(--color-text)",
  background: "var(--color-surface-2)",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 14px", borderBottom: "1px solid var(--color-border)",
  color: "var(--color-text-secondary)",
};
const tipStyle: React.CSSProperties = {
  padding: "14px 18px", borderRadius: "var(--radius-md)", fontSize: "13px",
  background: "rgba(99, 102, 241, 0.06)", border: "1px solid rgba(99, 102, 241, 0.15)",
  color: "var(--color-text-secondary)", margin: "16px 0", lineHeight: 1.7,
};

export default function ManualPage() {
  const [activeSection, setActiveSection] = useState("overview");

  return (
    <div style={{ padding: "36px 40px", maxWidth: "1280px", display: "flex", gap: "32px" }}>
      {/* 左: 目次 */}
      <nav style={{
        width: "220px", flexShrink: 0, position: "sticky", top: "24px", alignSelf: "flex-start",
        maxHeight: "calc(100vh - 48px)", overflowY: "auto",
      }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text-muted)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          マニュアル
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => { e.preventDefault(); setActiveSection(s.id); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" }); }}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "7px 12px", borderRadius: "var(--radius-sm)",
                fontSize: "13px", textDecoration: "none",
                color: activeSection === s.id ? "var(--color-primary)" : "var(--color-text-muted)",
                background: activeSection === s.id ? "var(--color-primary-light)" : "transparent",
                fontWeight: activeSection === s.id ? 600 : 400,
                transition: "all 0.15s ease",
              }}
            >
              {s.icon} {s.label}
            </a>
          ))}
        </div>
      </nav>

      {/* 右: コンテンツ */}
      <article style={{ flex: 1, minWidth: 0 }}>
        {/* ヘッダー */}
        <div style={{ marginBottom: "40px" }}>
          <h1 style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "-0.03em" }}>
            <span className="gradient-text">Agent Builder</span> マニュアル
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "15px", marginTop: "8px" }}>
            AIエージェント管理プラットフォーム v2.0 — 完全ガイド
          </p>
        </div>

        {/* ===== 概要 ===== */}
        <section id="overview" style={sectionStyle}>
          <h2 style={h2Style}><BookOpen size={22} style={{ color: "var(--color-primary)" }} /> 概要</h2>
          <p style={pStyle}>
            Agent Builder は、AIエージェントをGUIで作成・管理し、Claude Code や Antigravity から MCP 経由で利用できる Web アプリケーションです。
            スキルオーケストレーター、RAG（外部知識注入）、画像生成、マーケットプレイスなどの機能を統合しています。
          </p>
          <h3 style={h3Style}>主要機能一覧</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>機能</th><th style={thStyle}>説明</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}>エージェント管理</td><td style={tdStyle}>CRUD + プレイグラウンド（SSEストリーミング対応）</td></tr>
              <tr><td style={tdStyle}>スキルオーケストレーター</td><td style={tdStyle}>自然言語入力 → 最適なスキルを自動選択/生成 → 実行</td></tr>
              <tr><td style={tdStyle}>画像生成/編集</td><td style={tdStyle}>Gemini画像モデルでテキストから画像生成、画像編集</td></tr>
              <tr><td style={tdStyle}>ナレッジベース (RAG)</td><td style={tdStyle}>ドキュメントをアップロード → ベクトル検索 → エージェントに自動注入</td></tr>
              <tr><td style={tdStyle}>マーケットプレイス</td><td style={tdStyle}>エージェントを公開・検索・インポート</td></tr>
              <tr><td style={tdStyle}>自動化</td><td style={tdStyle}>スケジュール(cron) / Webhook / ワークフロー連鎖</td></tr>
              <tr><td style={tdStyle}>MCP サーバー</td><td style={tdStyle}>11ツール、Claude Code / Antigravity 連携</td></tr>
              <tr><td style={tdStyle}>マルチプロバイダー</td><td style={tdStyle}>Anthropic / Google / OpenAI のAPIキーを個別管理</td></tr>
            </tbody>
          </table>
          <h3 style={h3Style}>技術スタック</h3>
          <p style={pStyle}>
            Next.js 16 (App Router) / Tailwind CSS v4 / Supabase (PostgreSQL, Auth, RLS, pgvector) / マルチプロバイダーAI SDK
          </p>
        </section>

        {/* ===== はじめに ===== */}
        <section id="getting-started" style={sectionStyle}>
          <h2 style={h2Style}><Zap size={22} style={{ color: "var(--color-primary)" }} /> はじめに</h2>
          <h3 style={h3Style}>1. アカウント作成・ログイン</h3>
          <p style={pStyle}>ログイン画面からメールアドレスでサインアップしてください。初回ログイン時にワークスペースが自動作成されます。</p>
          <h3 style={h3Style}>2. APIキーの登録（必須）</h3>
          <div style={tipStyle}>
            <strong>重要:</strong> AI機能を使うには、ユーザー自身のAPIキーが必要です。開発者のAPIキーは使用されません。
            画面上部のバナーまたはサイドバーの「設定」からAPIキーを登録してください。
          </div>
          <p style={pStyle}>対応プロバイダー:</p>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>プロバイダー</th><th style={thStyle}>用途</th><th style={thStyle}>取得先</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}>Anthropic</td><td style={tdStyle}>エージェント実行 (Claude)</td><td style={tdStyle}>console.anthropic.com</td></tr>
              <tr><td style={tdStyle}>Google AI</td><td style={tdStyle}>画像生成 + RAG Embedding + Gemini</td><td style={tdStyle}>aistudio.google.com</td></tr>
              <tr><td style={tdStyle}>OpenAI</td><td style={tdStyle}>GPT-4o エージェント（任意）</td><td style={tdStyle}>platform.openai.com</td></tr>
            </tbody>
          </table>
          <p style={pStyle}>APIキーはAES-256-GCMで暗号化され、安全にDBに保存されます。</p>
          <h3 style={h3Style}>3. 最初のエージェントを作成</h3>
          <p style={pStyle}>サイドバーの「新しいエージェント」ボタンから作成します。名前、システムプロンプト、モデルを設定するだけでAIエージェントが動作します。</p>
        </section>

        {/* ===== エージェント ===== */}
        <section id="agents" style={sectionStyle}>
          <h2 style={h2Style}><Bot size={22} style={{ color: "var(--color-primary)" }} /> エージェント</h2>
          <p style={pStyle}>エージェントはAIの動作を定義する基本単位です。システムプロンプト、モデル、温度などを設定して様々な用途に使えます。</p>
          <h3 style={h3Style}>作成</h3>
          <p style={pStyle}>「エージェント」→「新しいエージェント」から作成。「AI支援」ボタンで目的を入力するとシステムプロンプトが自動生成されます。</p>
          <h3 style={h3Style}>プレイグラウンド</h3>
          <p style={pStyle}>エージェント一覧の「実行」ボタンからプレイグラウンドを開けます。SSEストリーミングでリアルタイムに応答が表示されます。</p>
          <h3 style={h3Style}>画像生成エージェント</h3>
          <div style={tipStyle}>
            タグに <code style={codeStyle}>画像生成</code> を含むエージェントは、プロンプト設計後に自動で画像を生成します。AIの応答から英語プロンプトを抽出し、Gemini画像モデルで生成します。
          </div>
          <h3 style={h3Style}>ナレッジベース紐づけ</h3>
          <p style={pStyle}>エージェント編集画面の下部「ナレッジベース (RAG)」セクションで、KBをチェックボックスで選択できます。紐づけたKBの内容がエージェント実行時に自動的にコンテキストとして注入されます。</p>
          <h3 style={h3Style}>エージェント連鎖（パイプライン）</h3>
          <p style={pStyle}>複数エージェントを順次実行し、前のエージェントの出力を次の入力にする機能です。APIまたはMCPの <code style={codeStyle}>pipeline</code> で利用できます。</p>
        </section>

        {/* ===== オーケストレーター ===== */}
        <section id="orchestrator" style={sectionStyle}>
          <h2 style={h2Style}><Brain size={22} style={{ color: "var(--color-primary)" }} /> スキルオーケストレーター</h2>
          <p style={pStyle}>自然言語で指示するだけで、最適なスキルを自動選択・実行します。適切なスキルがなければ自動生成して実行します。</p>
          <h3 style={h3Style}>動作フロー</h3>
          <pre style={codeBlockStyle}>{`Step 1: キーワードマッチ（無料、DB検索のみ）
Step 2: AIセマンティックマッチ（Haiku = 低コスト）
Step 3: マッチなし → スキル自動生成（Sonnet）
Step 4: スキル実行（ユーザー設定モデル）

画像生成の意図を検知した場合 → 直接画像生成APIを呼び出し`}</pre>
          <h3 style={h3Style}>コスト最適化</h3>
          <p style={pStyle}>マッチング判定には最安モデル（Haiku）を使用し、1リクエストあたり約$0.004で実行できます。</p>
        </section>

        {/* ===== 画像生成 ===== */}
        <section id="image" style={sectionStyle}>
          <h2 style={h2Style}><ImageIcon size={22} style={{ color: "var(--color-primary)" }} /> 画像生成</h2>
          <p style={pStyle}>Gemini画像生成モデルを使って、テキストプロンプトから画像を生成します。Google AIのAPIキーが必要です。</p>
          <h3 style={h3Style}>対応モデル</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>モデル</th><th style={thStyle}>特徴</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}>gemini-2.5-flash-image</td><td style={tdStyle}>高速・低コスト（デフォルト）</td></tr>
              <tr><td style={tdStyle}>gemini-3-pro-image-preview</td><td style={tdStyle}>NanobananaPro — 最高品質</td></tr>
              <tr><td style={tdStyle}>gemini-3.1-flash-image-preview</td><td style={tdStyle}>最新Flash</td></tr>
            </tbody>
          </table>
          <h3 style={h3Style}>機能</h3>
          <p style={pStyle}><strong>画像生成:</strong> テキストプロンプトから新規画像を生成。アスペクト比（1:1, 16:9等）、サイズ（1K/2K/4K）を選択可能。</p>
          <p style={pStyle}><strong>画像編集 (I2I):</strong> 既存画像 + テキスト指示で画像を編集。</p>
          <p style={pStyle}><strong>バッチ生成:</strong> 1つのプロンプトから複数バリエーションを並列生成（最大4枚）。</p>
          <p style={pStyle}><strong>テンプレート:</strong> フォトリアリスティック、アニメ、水彩画など7種類のプリセットテンプレートを用意。</p>
        </section>

        {/* ===== RAG ===== */}
        <section id="rag" style={sectionStyle}>
          <h2 style={h2Style}><Search size={22} style={{ color: "var(--color-primary)" }} /> ナレッジベース (RAG)</h2>
          <p style={pStyle}>
            ドキュメントをアップロードすると、自動的にチャンク分割 → Embedding生成 → ベクトルDB保存が行われます。
            エージェント実行時に関連ドキュメントが自動検索され、コンテキストとしてシステムプロンプトに注入されます。
          </p>
          <h3 style={h3Style}>アーキテクチャ</h3>
          <pre style={codeBlockStyle}>{`ファイルアップロード
  → チャンク分割（Markdown見出し/段落/文で階層的に分割）
  → Embedding生成（Gemini gemini-embedding-001、768次元）
  → pgvector に保存（HNSW インデックス）

エージェント実行時:
  ユーザー入力 → Embedding → コサイン類似度検索
  → 関連チャンク取得 → システムプロンプトに注入`}</pre>
          <h3 style={h3Style}>対応ファイル形式</h3>
          <p style={pStyle}>PDF / テキスト (.txt) / Markdown (.md) / CSV — ドラッグ&ドロップまたはテキスト貼り付けでアップロード。最大10MB。</p>
          <h3 style={h3Style}>使い方</h3>
          <p style={pStyle}>1. 「ナレッジ」ページでナレッジベースを作成</p>
          <p style={pStyle}>2. ドキュメントをアップロード（Embedding自動生成）</p>
          <p style={pStyle}>3. エージェント編集画面でKBにチェック → 保存</p>
          <p style={pStyle}>4. エージェント実行時に自動でRAG検索＆コンテキスト注入</p>
          <h3 style={h3Style}>ドキュメント管理</h3>
          <p style={pStyle}>アップロード済みドキュメントはクリックでプレビュー表示。「原文」タブで全文、「チャンク」タブで分割されたチャンクを確認できます。「編集」ボタンで原文を修正すると、再チャンク＋再Embeddingが自動実行されます。</p>
        </section>

        {/* ===== マーケットプレイス ===== */}
        <section id="marketplace" style={sectionStyle}>
          <h2 style={h2Style}><Store size={22} style={{ color: "var(--color-primary)" }} /> マーケットプレイス</h2>
          <p style={pStyle}>エージェントを公開して他のユーザーと共有できます。公開エージェントはインストール（複製）して自分のワークスペースで利用できます。</p>
          <h3 style={h3Style}>公開方法</h3>
          <p style={pStyle}>エージェント編集画面で公開範囲を「Public」に設定すると、マーケットプレイスに自動表示されます。</p>
          <h3 style={h3Style}>インストール</h3>
          <p style={pStyle}>マーケットプレイスのエージェントカードの「インストール」ボタンで、自分のワークスペースにエージェントが複製されます。</p>
        </section>

        {/* ===== 自動化 ===== */}
        <section id="automation" style={sectionStyle}>
          <h2 style={h2Style}><RefreshCw size={22} style={{ color: "var(--color-primary)" }} /> 自動化</h2>
          <p style={pStyle}>エージェントの実行をスケジュール化したり、Webhookで外部システムからトリガーできます。</p>
          <h3 style={h3Style}>スケジュール実行</h3>
          <p style={pStyle}>cron式で定期実行を設定。例: 毎日9時にニュース収集エージェントを実行。</p>
          <h3 style={h3Style}>Webhook</h3>
          <p style={pStyle}>ユニークなWebhook URLが発行され、外部システムからHTTP POSTでエージェントをトリガーできます。</p>
        </section>

        {/* ===== テスト ===== */}
        <section id="testing" style={sectionStyle}>
          <h2 style={h2Style}><TestTube size={22} style={{ color: "var(--color-primary)" }} /> エージェントテスト</h2>
          <p style={pStyle}>エージェントの品質を自動テストする機能です。テストケースを登録し、期待出力との比較で品質を検証します。</p>
          <h3 style={h3Style}>アサーション種別</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>種別</th><th style={thStyle}>説明</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}>contains</td><td style={tdStyle}>出力に期待文字列が含まれる</td></tr>
              <tr><td style={tdStyle}>exact</td><td style={tdStyle}>出力が期待文字列と完全一致</td></tr>
              <tr><td style={tdStyle}>regex</td><td style={tdStyle}>出力が正規表現にマッチ</td></tr>
              <tr><td style={tdStyle}>not_contains</td><td style={tdStyle}>出力に期待文字列が含まれない</td></tr>
              <tr><td style={tdStyle}>json_schema</td><td style={tdStyle}>出力が有効なJSONである</td></tr>
            </tbody>
          </table>
        </section>

        {/* ===== MCP ===== */}
        <section id="mcp" style={sectionStyle}>
          <h2 style={h2Style}><Link2 size={22} style={{ color: "var(--color-primary)" }} /> MCP連携</h2>
          <p style={pStyle}>Claude Code や Antigravity から MCP (Model Context Protocol) 経由で全機能を利用できます。</p>
          <h3 style={h3Style}>設定方法</h3>
          <p style={pStyle}><strong>Claude Code:</strong> <code style={codeStyle}>~/.claude/settings.json</code> の mcpServers に追加</p>
          <p style={pStyle}><strong>Antigravity:</strong> <code style={codeStyle}>~/.gemini/antigravity/mcp_config.json</code> の mcpServers に追加</p>
          <pre style={codeBlockStyle}>{`{
  "agent-builder": {
    "command": "node",
    "args": ["<プロジェクトパス>/mcp-server/dist/index.js"],
    "env": {
      "AGENT_BUILDER_URL": "https://your-app.vercel.app",
      "AGENT_BUILDER_KEY": "<APIキー>"
    }
  }
}`}</pre>
          <h3 style={h3Style}>利用可能なツール（11種）</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>ツール</th><th style={thStyle}>説明</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}><code style={codeStyle}>orchestrate</code></td><td style={tdStyle}>自然言語で指示 → スキル自動選択・実行</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>agent_list</code></td><td style={tdStyle}>エージェント一覧</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>agent_run</code></td><td style={tdStyle}>エージェント実行（画像生成エージェントは画像付き）</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>agent_get</code></td><td style={tdStyle}>エージェント詳細</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>agent_create</code></td><td style={tdStyle}>エージェント作成</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>agent_update</code></td><td style={tdStyle}>エージェント更新</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>agent_delete</code></td><td style={tdStyle}>エージェント削除</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>agent_log</code></td><td style={tdStyle}>実行ログ</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>skill_list</code></td><td style={tdStyle}>スキル一覧</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>image_generate</code></td><td style={tdStyle}>画像生成（ファイル保存対応）</td></tr>
              <tr><td style={tdStyle}><code style={codeStyle}>knowledge_search</code></td><td style={tdStyle}>ナレッジベース検索 (RAG)</td></tr>
            </tbody>
          </table>
          <h3 style={h3Style}>Antigravityからの使用例</h3>
          <pre style={codeBlockStyle}>{`# エージェント一覧
agent-builderのagent_listでエージェント一覧を取得して

# オーケストレーター
agent-builderのorchestrateで「最新のAIニュースをまとめて」を実行して

# 画像生成エージェント
agent-builderのagent_runで画像生成Agent（ID: xxx）に
「桜の画像を生成して」と送信して

# 直接画像生成
agent-builderのimage_generateで「東京タワーの夜景」を生成して
/tmp/tokyo.png に保存して

# ナレッジベース検索
agent-builderのknowledge_searchで「技術スタック」について検索して`}</pre>
        </section>

        {/* ===== 設定 ===== */}
        <section id="settings" style={sectionStyle}>
          <h2 style={h2Style}><Settings size={22} style={{ color: "var(--color-primary)" }} /> 設定</h2>
          <h3 style={h3Style}>APIキー管理</h3>
          <p style={pStyle}>「設定」画面から各プロバイダーのAPIキーを登録・管理できます。キーはAES-256-GCMで暗号化されて保存されます。登録時に接続テストが自動実行されます。</p>
          <h3 style={h3Style}>コスト上限</h3>
          <p style={pStyle}><code style={codeStyle}>/api/settings/cost-limits</code> で月間コスト上限を設定できます。上限に達するとリクエストがブロックされます（ハードリミット設定時）。</p>
          <h3 style={h3Style}>レート制限</h3>
          <p style={pStyle}>ワークスペース単位のAPIリクエスト数制限が設定されています。画像生成は1分あたり10リクエスト、その他は30リクエストが上限です。</p>
        </section>

        {/* ===== ログ ===== */}
        <section id="logs" style={sectionStyle}>
          <h2 style={h2Style}><BarChart3 size={22} style={{ color: "var(--color-primary)" }} /> ログ・分析</h2>
          <p style={pStyle}>全てのエージェント実行のログが記録されます。入力、出力、トークン数、コスト、レイテンシを確認できます。</p>
          <h3 style={h3Style}>エクスポート</h3>
          <p style={pStyle}>ログ画面からCSVまたはJSONでエクスポート可能です。日付範囲、エージェント、ステータスでフィルタリングできます。</p>
        </section>

        {/* ===== API ===== */}
        <section id="api" style={sectionStyle}>
          <h2 style={h2Style}><FileText size={22} style={{ color: "var(--color-primary)" }} /> APIリファレンス</h2>
          <p style={pStyle}>全APIエンドポイントは <code style={codeStyle}>Authorization: Bearer &lt;APIキー&gt;</code> ヘッダーで認証します。APIキーは「MCP設定」画面から発行できます。</p>
          <h3 style={h3Style}>主要エンドポイント</h3>
          <table style={tableStyle}>
            <thead>
              <tr><th style={thStyle}>メソッド</th><th style={thStyle}>パス</th><th style={thStyle}>説明</th></tr>
            </thead>
            <tbody>
              <tr><td style={tdStyle}>GET</td><td style={tdStyle}>/api/agents</td><td style={tdStyle}>エージェント一覧</td></tr>
              <tr><td style={tdStyle}>POST</td><td style={tdStyle}>/api/agents</td><td style={tdStyle}>エージェント作成</td></tr>
              <tr><td style={tdStyle}>POST</td><td style={tdStyle}>/api/agents/[id]/run</td><td style={tdStyle}>エージェント実行</td></tr>
              <tr><td style={tdStyle}>POST</td><td style={tdStyle}>/api/agents/pipeline</td><td style={tdStyle}>エージェント連鎖実行</td></tr>
              <tr><td style={tdStyle}>POST</td><td style={tdStyle}>/api/orchestrator</td><td style={tdStyle}>オーケストレーター</td></tr>
              <tr><td style={tdStyle}>POST</td><td style={tdStyle}>/api/image/generate</td><td style={tdStyle}>画像生成</td></tr>
              <tr><td style={tdStyle}>POST</td><td style={tdStyle}>/api/image/edit</td><td style={tdStyle}>画像編集</td></tr>
              <tr><td style={tdStyle}>POST</td><td style={tdStyle}>/api/image/batch</td><td style={tdStyle}>バッチ画像生成</td></tr>
              <tr><td style={tdStyle}>GET</td><td style={tdStyle}>/api/knowledge</td><td style={tdStyle}>ナレッジベース一覧</td></tr>
              <tr><td style={tdStyle}>POST</td><td style={tdStyle}>/api/knowledge/[id]/upload</td><td style={tdStyle}>ファイルアップロード (RAG)</td></tr>
              <tr><td style={tdStyle}>POST</td><td style={tdStyle}>/api/knowledge/search</td><td style={tdStyle}>ベクトル検索</td></tr>
              <tr><td style={tdStyle}>GET</td><td style={tdStyle}>/api/marketplace</td><td style={tdStyle}>マーケットプレイス一覧</td></tr>
              <tr><td style={tdStyle}>GET</td><td style={tdStyle}>/api/logs/export</td><td style={tdStyle}>ログエクスポート (CSV/JSON)</td></tr>
            </tbody>
          </table>
        </section>
      </article>
    </div>
  );
}
