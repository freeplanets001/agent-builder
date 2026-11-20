-- エージェントテストケーステーブル
CREATE TABLE IF NOT EXISTS agent_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  expected_output TEXT,
  assertion_type TEXT NOT NULL DEFAULT 'contains'
    CHECK (assertion_type IN ('contains', 'exact', 'regex', 'not_contains', 'json_schema')),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- テスト実行結果テーブル
CREATE TABLE IF NOT EXISTS agent_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'passed', 'failed', 'error')),
  total_cases INTEGER DEFAULT 0,
  passed_cases INTEGER DEFAULT 0,
  failed_cases INTEGER DEFAULT 0,
  total_latency_ms INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,6) DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 個別テスト結果
CREATE TABLE IF NOT EXISTS agent_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_test_runs(id) ON DELETE CASCADE,
  test_case_id UUID NOT NULL REFERENCES agent_test_cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error')),
  actual_output TEXT,
  error_message TEXT,
  latency_ms INTEGER,
  cost_usd NUMERIC(10,6),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE agent_test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "test_cases_workspace" ON agent_test_cases
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "test_runs_workspace" ON agent_test_runs
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "test_results_workspace" ON agent_test_results
  FOR ALL USING (
    run_id IN (SELECT id FROM agent_test_runs WHERE workspace_id IN (SELECT get_my_workspace_ids()))
  );

-- インデックス
CREATE INDEX IF NOT EXISTS idx_test_cases_agent ON agent_test_cases(agent_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_agent ON agent_test_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_test_results_run ON agent_test_results(run_id);
