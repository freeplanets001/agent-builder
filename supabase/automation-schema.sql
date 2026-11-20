-- ============================================================
-- 自動化テーブル定義
-- スケジュール・Webhook・ワークフロー連鎖の3種類をサポート
-- ============================================================

-- ============================================================
-- automations テーブル（自動化ルール）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.automations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by       UUID NOT NULL REFERENCES public.profiles(id),
  name             TEXT NOT NULL CHECK (char_length(name) <= 200),
  description      TEXT,
  -- トリガー種別
  trigger_type     TEXT NOT NULL CHECK (trigger_type IN ('schedule', 'webhook', 'workflow')),
  -- トリガー設定（JSON）
  --   schedule: { "cron": "0 9 * * *", "timezone": "Asia/Tokyo" }
  --   webhook:  { "secret": "...", "allowed_ips": [] }
  --   workflow: { "steps": [{ "agent_id": "...", "input_template": "..." }] }
  trigger_config   JSONB NOT NULL DEFAULT '{}',
  -- 実行するエージェントID（scheduleとwebhookの場合）
  agent_id         UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  -- エージェントへの入力テンプレート（{{変数}}を含む）
  input_template   TEXT,
  -- 有効/無効
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  -- 最終実行日時
  last_run_at      TIMESTAMPTZ,
  -- 次回実行予定（scheduleの場合）
  next_run_at      TIMESTAMPTZ,
  -- 実行回数
  run_count        INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- automation_runs テーブル（自動化の実行履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id    UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'success', 'error', 'cancelled')),
  -- ワークフローの場合、各ステップの結果を記録
  steps            JSONB,
  -- 最終出力
  output           TEXT,
  error_message    TEXT,
  -- 実行時間
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Webhook用のトークンテーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_tokens (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id    UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE UNIQUE,
  -- URLパスに含めるトークン（推測不可能なランダム文字列）
  token            TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_automations_workspace_id ON public.automations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automations_next_run_at ON public.automations(next_run_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON public.automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_webhook_tokens_token ON public.webhook_tokens(token);

-- RLS有効化
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_tokens ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（SECURITY DEFINER関数を使用して無限再帰を回避）
CREATE POLICY "automations_select" ON public.automations
  FOR SELECT USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY "automations_insert" ON public.automations
  FOR INSERT WITH CHECK (public.is_workspace_editor(workspace_id));

CREATE POLICY "automations_update" ON public.automations
  FOR UPDATE USING (public.is_workspace_editor(workspace_id));

CREATE POLICY "automations_delete" ON public.automations
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "automation_runs_select" ON public.automation_runs
  FOR SELECT USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY "automation_runs_insert" ON public.automation_runs
  FOR INSERT WITH CHECK (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY "webhook_tokens_select" ON public.webhook_tokens
  FOR SELECT USING (
    automation_id IN (SELECT id FROM public.automations)
  );

CREATE POLICY "webhook_tokens_insert" ON public.webhook_tokens
  FOR INSERT WITH CHECK (
    automation_id IN (SELECT id FROM public.automations)
  );

CREATE POLICY "webhook_tokens_delete" ON public.webhook_tokens
  FOR DELETE USING (
    automation_id IN (SELECT id FROM public.automations)
  );

-- updated_at トリガー
CREATE TRIGGER set_automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
