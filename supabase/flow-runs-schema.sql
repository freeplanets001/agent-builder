-- Flow Runs: フロー実行履歴テーブル

CREATE TABLE IF NOT EXISTS public.flow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'success', 'error', 'cancelled')),
  input TEXT NOT NULL,
  output TEXT,
  -- 各ノードの実行結果 { nodeId: { status, input, output, cost_usd, latency_ms, ... } }
  node_results JSONB DEFAULT '{}',
  -- human-in-the-loop: 一時停止中のノードID
  paused_at_node_id UUID,
  -- 統計
  total_cost_usd FLOAT DEFAULT 0,
  total_latency_ms INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE flow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_runs_workspace_access" ON flow_runs
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE INDEX IF NOT EXISTS idx_flow_runs_flow ON flow_runs(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_runs_status ON flow_runs(status);
