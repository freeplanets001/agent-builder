-- ============================================================
-- スキルレジストリ — 自己拡張エージェント基盤
--
-- スキル = 再利用可能なAI能力の単位。
-- エージェントが「目的に合うスキルを探す → なければ自動生成」を行う。
-- ============================================================

-- ============================================================
-- skills テーブル（スキル定義）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.skills (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by       UUID NOT NULL REFERENCES public.profiles(id),
  -- 基本情報
  name             TEXT NOT NULL CHECK (char_length(name) <= 100),
  description      TEXT NOT NULL,
  -- スキルの種別
  --   prompt: システムプロンプトベースのスキル（エージェントとして実行）
  --   command: 定型処理コマンド（テンプレート入力 → エージェント実行）
  --   workflow: 複数エージェントの連鎖実行
  skill_type       TEXT NOT NULL DEFAULT 'prompt'
                     CHECK (skill_type IN ('prompt', 'command', 'workflow')),
  -- マッチング用キーワード（AI がユーザー意図とのマッチに使う）
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  -- マッチング用の意図説明（AIが類似度判定に使う自然言語）
  intent_description TEXT NOT NULL DEFAULT '',
  -- スキル本体: prompt の場合
  system_prompt    TEXT,
  model            TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  temperature      FLOAT NOT NULL DEFAULT 0.7,
  max_tokens       INTEGER NOT NULL DEFAULT 4096,
  -- スキル本体: command の場合
  input_template   TEXT,
  -- スキル本体: workflow の場合
  workflow_steps   JSONB,
  -- 紐づくエージェントID（既存エージェントをスキル化した場合）
  agent_id         UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  -- メタデータ
  tags             TEXT[] NOT NULL DEFAULT '{}',
  -- AIが自動生成したスキルか
  is_auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  -- 使用回数（人気度で優先マッチング）
  use_count        INTEGER NOT NULL DEFAULT 0,
  -- 最終使用日時
  last_used_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- skill_executions テーブル（スキル実行履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.skill_executions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id         UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id),
  -- オーケストレーターが受け取った元の入力
  original_input   TEXT NOT NULL,
  -- スキルに渡した実際の入力
  resolved_input   TEXT NOT NULL,
  -- 出力
  output           TEXT,
  status           TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'success', 'error')),
  error_message    TEXT,
  -- スキルが自動生成された場合 TRUE
  was_auto_created BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms       INTEGER NOT NULL DEFAULT 0,
  cost_usd         FLOAT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_skills_workspace_id ON public.skills(workspace_id);
CREATE INDEX IF NOT EXISTS idx_skills_trigger_keywords ON public.skills USING GIN(trigger_keywords);
CREATE INDEX IF NOT EXISTS idx_skills_tags ON public.skills USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_skills_use_count ON public.skills(use_count DESC);
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill_id ON public.skill_executions(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_workspace_id ON public.skill_executions(workspace_id);

-- RLS
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills_select" ON public.skills
  FOR SELECT USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY "skills_insert" ON public.skills
  FOR INSERT WITH CHECK (public.is_workspace_editor(workspace_id));

CREATE POLICY "skills_update" ON public.skills
  FOR UPDATE USING (public.is_workspace_editor(workspace_id));

CREATE POLICY "skills_delete" ON public.skills
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "skill_executions_select" ON public.skill_executions
  FOR SELECT USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY "skill_executions_insert" ON public.skill_executions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- updated_at トリガー
CREATE TRIGGER set_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
