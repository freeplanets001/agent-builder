# Agent Builder — 開発引き継ぎメモ

## プロジェクト概要
AIエージェントをGUIで作成・管理し、Claude Code / Antigravity からMCP経由で利用できるようにするWebアプリ。
スキルオーケストレーター機能により、AIが自律的にスキルを選択・生成・実行する。

## 技術スタック
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **Database/Auth**: Supabase (PostgreSQL, Auth, RLS)
- **AI SDK**: マルチプロバイダー対応（Anthropic / Google Gemini / OpenAI）
- **MCP Server**: @modelcontextprotocol/sdk (9ツール)
- **Deployment**: Vercel (予定)

## 主要機能
1. **エージェント管理** — CRUD + プレイグラウンド（SSEストリーミング）
2. **スキルオーケストレーター** — ユーザー指示 → スキルマッチング → なければ自動生成 → 実行
3. **AI支援プロンプト作成** — 目的からシステムプロンプトを自動生成
4. **自動化** — スケジュール(cron) / Webhook / ワークフロー連鎖
5. **MCPサーバー** — 9ツール（CRUD + orchestrate + skill_list）
6. **実行ログ + 分析ダッシュボード**
7. **マルチプロバイダーAPIキー管理** — 設定画面からAnthropic/Google/OpenAIのAPIキーを暗号化保存

## コスト最適化戦略
- **Step 1**: キーワードマッチ（DB検索のみ、API呼び出しなし = 無料）
- **Step 2**: セマンティックマッチング → **Haiku** (最安モデル) で候補選別
- **Step 3**: スキル実行 → ユーザーが設定したモデル
- **Step 4**: スキル生成のみ → **Sonnet** (中コスト、生成品質が必要なため)
- コスト概算: マッチング約$0.0005 + 実行$0.003〜 = 1リクエスト約$0.004

## 重要なファイル
- `lib/ai-client.ts`: **AIプロバイダー振り分け** — モデル名から自動でSDKを選択、DBからAPIキー取得
- `lib/ai-providers/`: Anthropic/Google/OpenAIアダプター + 共通型定義
- `lib/crypto.ts`: APIキー暗号化（AES-256-GCM）
- `app/api/settings/api-keys/route.ts`: プロバイダーAPIキーCRUD
- `app/api/orchestrator/route.ts`: **核心** — スキルマッチング + 自動生成 + 実行
- `app/api/skills/`: スキルCRUD API
- `app/api/agents/[id]/run/route.ts`: エージェント実行（SSE対応）
- `app/api/automations/`: 自動化CRUD + 実行API
- `app/api/webhooks/[token]/route.ts`: Webhook受信
- `app/api/ai/generate-prompt/route.ts`: AI支援プロンプト生成
- `mcp-server/src/index.ts`: MCPサーバー本体（9ツール）
- `supabase/schema.sql`: メインスキーマ（16テーブル）
- `supabase/automation-schema.sql`: 自動化テーブル
- `supabase/skills-schema.sql`: スキルレジストリテーブル

## DB適用が必要なSQL
1. `supabase/fix-rls-recursion.sql` — RLS無限再帰修正（適用済み）
2. `supabase/automation-schema.sql` — 自動化テーブル
3. `supabase/skills-schema.sql` — スキルテーブル
4. `supabase/provider-api-keys-schema.sql` — プロバイダーAPIキーテーブル

## ローカル開発
```bash
npm install && npm run dev
cd mcp-server && npm install && npm run dev
```

## 注意点
- **環境変数**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `API_KEY_ENCRYPTION_SECRET`
- **AIプロバイダーキー**: 環境変数（`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`）またはWebアプリの設定画面から登録（DB優先、環境変数はフォールバック）
- **RLSポリシー**: 新テーブル追加時は `get_my_workspace_ids()` 等のSECURITY DEFINER関数を使うこと
- **コスト管理**: オーケストレーターはHaikuでマッチング、Sonnetで生成と使い分けている
- **マルチプロバイダー**: `lib/ai-client.ts` がモデル名からプロバイダーを自動判定。Gemini/GPTも選択可能
