# Agent Builder 開発進捗ログ

## 2026-03-25 セッション

### 完了した作業

#### Phase 2 (Tier 2) — 全5機能完了 ✅

| # | 機能 | 主な変更ファイル |
|---|------|-----------------|
| 2-4 | マルチモーダルエージェント | `Playground.tsx`（画像D&D/ペースト）, `run/route.ts`（attachments永続化）, `multimodal-schema.sql` |
| 2-1 | 評価フレームワーク | `EvaluationDashboard.tsx`（テストスイート管理/A/B比較）, `evaluate/page.tsx` |
| 2-3 | エージェント間通信 | `PipelineDashboard.tsx`（パイプラインUI）, `pipelines/page.tsx`, `Sidebar.tsx`（ナビ追加） |
| 2-2 | プロンプトバージョニング | `VersionDashboard.tsx`（バージョン一覧/差分/カナリア）, `versions/page.tsx` |
| 2-5 | エージェントデバッガー | `logs/page.tsx`（DebugTimelineタイムライン追加） |

#### バグ修正

| バグ | 原因 | 修正 |
|------|------|------|
| Gemini選択時にAnthropicキーエラー | `generate-prompt`と`orchestrator`がClaude固定 | `resolveAvailableModel()`で動的フォールバック（`ai-client.ts`） |
| APIキーバナーが邪魔 | `layout.tsx`に固定バナー | バナー+関連クエリを完全削除 |
| ナレッジベース 0ドキュメント/0チャンク | upload/delete時にカウント未更新 | 集計更新ロジック追加 + GET時サブクエリ集計 |
| file_writeがファイル保存できない | console.logのみで実際に保存なし | Supabase Storage対応 + 署名付きURL返却 |

#### Agentic RAG

| 変更 | 内容 |
|------|------|
| `lib/tool-executor.ts` | `knowledge_search`ツール追加。ベクトル類似度検索、並行KB検索 |
| `lib/types.ts` | `ToolType`に`"knowledge_search"`追加 |

#### デプロイ
- Vercelデプロイ 4回実行、全て成功
- 本番URL: https://agent-builder-teal.vercel.app

---

### 次に実施する作業

#### Agentic RAG 追加機能（オプション）
- [ ] クエリリライト — 短いクエリをHaikuで拡張
- [ ] 関連性グレーディング — 検索結果の品質をLLMで評価
- [ ] エージェントUI でknowledge_searchツール有効化のUI対応

#### Phase 3 (Tier 3) — 7機能
| # | 機能 | 概要 |
|---|------|------|
| 3-4 | テンプレートギャラリー | `agent_templates`テーブル + テンプレ一覧 + 「テンプレから作成」 |
| 3-1 | Agent Store（収益化） | Stripe連携、価格設定、購入フロー |
| 3-2 | チーム協業 + RBAC | Supabase Realtimeで同時編集、コメント、ロール |
| 3-5 | Integration Hub | Slack/Discord/LINE/GitHub/Notionコネクタ |
| 3-3 | Plugin SDK | `@agent-builder/sdk`, `defineCustomTool()` |
| 3-6 | Observability | OpenTelemetryスパン計測 |
| 3-7 | Edge Deploy | Vercel Edge Function化ワンクリックデプロイ |

#### Supabase Storage セットアップ（必要）
- `agent-outputs`バケットをSupabaseダッシュボードで作成
- RLSポリシー設定（workspace_id ベース）

#### 適用が必要なSQLスキーマ
全11ファイル（`supabase/`ディレクトリ内）。Phase 1-2で追加されたテーブル/カラムの本番適用が必要。

---

### 技術的決定事項

1. **AIモデル動的解決**: `resolveAvailableModel(tier)` — 登録済みプロバイダーを検出し、コスト最適なモデルを返す
   - fast: gemini-flash → haiku → gpt-4o-mini
   - smart: gemini-pro → sonnet → gpt-4o

2. **file_write**: Supabase Storage優先、未設定時はコンテンツをそのまま返すフォールバック

3. **knowledge_search**: パッシブRAG（getRagContext）と共存するハイブリッド方式。エージェントが明示的にツールとして呼び出せる
