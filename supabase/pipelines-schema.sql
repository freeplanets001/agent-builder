-- Agent Pipelines: エージェント間の宣言的パイプライン

CREATE TABLE IF NOT EXISTS public.agent_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- パイプライン定義: [{ agent_id, role, input_template }]
  steps JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES agent_pipelines(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  input TEXT NOT NULL,
  output TEXT,
  -- 各ステップの結果: [{ agent_id, role, input, output, cost_usd, latency_ms }]
  step_results JSONB DEFAULT '[]',
  total_cost_usd FLOAT DEFAULT 0,
  total_latency_ms INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE agent_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipelines_workspace" ON agent_pipelines
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "pipeline_runs_workspace" ON pipeline_runs
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
