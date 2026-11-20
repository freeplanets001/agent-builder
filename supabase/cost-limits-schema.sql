-- ワークスペースコスト上限テーブル
CREATE TABLE IF NOT EXISTS workspace_cost_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  monthly_limit_usd NUMERIC(10,4) DEFAULT 10.0,
  alert_threshold_percent INTEGER DEFAULT 80,
  is_hard_limit BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workspace_cost_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_limits_workspace" ON workspace_cost_limits
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
