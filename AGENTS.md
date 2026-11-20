# AGENTS.md — Agent Builder プロジェクトルール

## プロジェクト概要

WebアプリでAIエージェント（システムプロンプト＋ツール設定）をGUIで作成・管理する。
作ったエージェントをClaude CodeがMCP経由で呼び出して使えるようにする。

## 技術スタック

- **フレームワーク**: Next.js 15（App Router, TypeScript）
- **スタイリング**: Tailwind CSS v4
- **データベース**: Supabase（PostgreSQL + Auth）
- **MCPサーバー**: @modelcontextprotocol/sdk
- **デプロイ**: Vercel

## ディレクトリ構造

```
agent-builder/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx            # GitHub OAuthログイン画面
│   ├── (dashboard)/
│   │   ├── layout.tsx              # ダッシュボードレイアウト（Sidebar付き）
│   │   ├── page.tsx                # ダッシュボード（統計 + エージェント一覧）
│   │   ├── agents/
│   │   │   ├── page.tsx            # エージェント一覧
│   │   │   ├── new/page.tsx        # エージェント作成
│   │   │   └── [id]/
│   │   │       ├── edit/page.tsx   # エージェント編集
│   │   │       └── play/page.tsx   # プレイグラウンド
│   │   ├── flows/
│   │   │   ├── page.tsx            # マルチエージェントフロー一覧
│   │   │   └── [id]/page.tsx       # フロービジュアルエディタ
│   │   ├── logs/page.tsx           # 実行ログ
│   │   ├── analytics/page.tsx      # 分析ダッシュボード
│   │   └── mcp/page.tsx            # MCP設定エクスポート
│   ├── api/
│   │   ├── agents/
│   │   │   ├── route.ts            # GET/POST エージェントCRUD
│   │   │   └── [id]/
│   │   │       ├── route.ts        # GET/PATCH/DELETE 個別エージェント
│   │   │       └── run/route.ts    # POST エージェント実行（SSEストリーミング）
│   │   └── flows/
│   │       ├── route.ts
│   │       └── [id]/
│   │           ├── route.ts
│   │           └── run/route.ts
│   ├── globals.css
│   ├── layout.tsx                  # ルートレイアウト
│   └── page.tsx                    # ルートページ（ダッシュボードへリダイレクト）
├── components/
│   ├── agents/
│   │   ├── AgentCard.tsx           # エージェントカードコンポーネント
│   │   ├── AgentForm.tsx           # エージェント作成・編集フォーム
│   │   ├── ModelSelector.tsx       # モデル選択UI
│   │   └── ToolSelector.tsx        # ツール選択UI
│   ├── flows/
│   │   └── FlowEditor.tsx          # React Flowビジュアルエディタ
│   ├── layout/
│   │   ├── Sidebar.tsx             # サイドバーナビゲーション
│   │   └── BottomNav.tsx           # モバイル用ボトムナビ
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       └── Modal.tsx
├── lib/
│   ├── types.ts                    # 全型定義
│   ├── supabase.ts                 # クライアントサイドSupabaseクライアント
│   └── supabase-server.ts          # サーバーサイドSupabaseクライアント
├── supabase/
│   └── schema.sql                  # 全16テーブル定義・RLS・トリガー
├── mcp-server/
│   ├── package.json
│   └── src/
│       └── index.ts                # MCPサーバー本体（全11ツール）
├── middleware.ts                   # JWT認証ミドルウェア
├── .env.local.example
└── AGENTS.md                       # このファイル
```

## コーディング規約

### TypeScript
- `any`型禁止 → `unknown` + 型ガードを使用
- 全変数・関数に型定義必須
- `lib/types.ts`に型を集約する
- Zodスキーマで全APIインプットを検証する

### ファイル命名
- コンポーネント: PascalCase（例: `AgentCard.tsx`）
- ユーティリティ: camelCase（例: `supabase.ts`）
- ページ: `page.tsx`（Next.js App Router規約）
- APIルート: `route.ts`（Next.js App Router規約）

### API設計
- 全エンドポイント（`/api/public/` 以外）はSupabase JWT認証必須
- エラーレスポンスは `{ error: string; code: string }` 形式
- ストリーミングは SSE（Server-Sent Events）を使用

### セキュリティ
- APIキーは `.env.local` のみ。ハードコード禁止
- Anthropic APIキーはサーバーサイドのみ（クライアントに渡さない）
- 外部AIプロバイダーのAPIキーはAES-256で暗号化してDBに保存
- Row Level Security（RLS）でDBレベルのデータ分離

### Git
- Conventional Commits厳守: `feat:` / `fix:` / `refactor:` / `chore:`
- ブランチ: `agent/<feature-name>`
- `.env.local`は`.gitignore`に必ず含める

## 環境変数

```
NEXT_PUBLIC_SUPABASE_URL      # SupabaseプロジェクトURL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase匿名キー（公開可）
SUPABASE_SERVICE_ROLE_KEY     # Supabaseサービスロールキー（サーバーサイドのみ）
ANTHROPIC_API_KEY             # Anthropic APIキー（サーバーサイドのみ）
NEXT_PUBLIC_APP_URL           # アプリURL
```

## Supabaseテーブル一覧（全16テーブル）

1. `profiles` — ユーザープロファイル
2. `workspaces` — ワークスペース
3. `workspace_members` — ワークスペースメンバー
4. `agents` — エージェント
5. `agent_versions` — エージェントバージョン履歴
6. `agent_tools` — エージェントツール設定
7. `agent_variables` — エージェント変数定義
8. `flows` — マルチエージェントフロー
9. `flow_nodes` — フローノード
10. `flow_edges` — フローエッジ
11. `execution_logs` — 実行ログ
12. `conversations` — 会話セッション
13. `messages` — メッセージ
14. `api_keys` — APIキー管理
15. `usage_stats` — 使用量統計
16. `marketplace_listings` — マーケットプレイス公開

## MCPサーバー ツール一覧（全11ツール）

1. `agent_list` — エージェント一覧取得
2. `agent_get` — エージェント詳細取得
3. `agent_run` — エージェント実行
4. `agent_switch` — アクティブエージェント切り替え
5. `agent_create` — エージェント作成
6. `agent_update` — エージェント更新
7. `agent_delete` — エージェント削除
8. `agent_pipeline` — パイプライン実行
9. `agent_test` — テスト実行
10. `agent_log` — ログ取得
11. `agent_export_mcp` — MCP設定エクスポート
