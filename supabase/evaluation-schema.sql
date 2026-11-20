-- Evaluation: エージェント評価フレームワーク

-- テストスイート
CREATE TABLE IF NOT EXISTS public.eval_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- テストケース
CREATE TABLE IF NOT EXISTS public.eval_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID NOT NULL REFERENCES eval_suites(id) ON DELETE CASCADE,
  input TEXT NOT NULL,
  expected_output TEXT,
  -- 評価基準 { "type": "contains|exact|ai_judge", "keywords": [...], ... }
  eval_criteria JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 評価実行
CREATE TABLE IF NOT EXISTS public.eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID NOT NULL REFERENCES eval_suites(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- A/Bテスト用
  agent_version INTEGER,
  model_override TEXT,
  prompt_override TEXT,
  label TEXT, -- A/Bラベル（"A", "B"等）
  -- 結果
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  total_cases INTEGER DEFAULT 0,
  passed_cases INTEGER DEFAULT 0,
  avg_score FLOAT DEFAULT 0,
  total_cost_usd FLOAT DEFAULT 0,
  total_latency_ms INTEGER DEFAULT 0,
  -- 個別結果 [{ case_id, input, expected, actual, score, passed, latency_ms }]
  results JSONB DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE eval_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eval_suites_workspace" ON eval_suites
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "eval_cases_access" ON eval_cases
  FOR ALL USING (suite_id IN (SELECT id FROM eval_suites));
CREATE POLICY "eval_runs_workspace" ON eval_runs
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE INDEX IF NOT EXISTS idx_eval_cases_suite ON eval_cases(suite_id);
CREATE INDEX IF NOT EXISTS idx_eval_runs_suite ON eval_runs(suite_id);
