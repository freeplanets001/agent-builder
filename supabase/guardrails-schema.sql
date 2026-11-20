-- Guardrails: エージェントの安全設定テーブル
CREATE TABLE IF NOT EXISTS public.agent_guardrails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  -- 入力フィルター
  input_injection_check BOOLEAN DEFAULT true,
  input_blocked_patterns TEXT[] DEFAULT '{}',
  -- 出力フィルター
  output_pii_check BOOLEAN DEFAULT true,
  output_pii_mask BOOLEAN DEFAULT true,
  output_blocked_patterns TEXT[] DEFAULT '{}',
  -- 動作モード: block=ブロック, warn=警告のみ, log=ログ記録のみ
  mode TEXT DEFAULT 'warn' CHECK (mode IN ('block', 'warn', 'log')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id)
);

ALTER TABLE agent_guardrails ENABLE ROW LEVEL SECURITY;

-- RLS: エージェントのワークスペースに属するユーザーのみアクセス可
CREATE POLICY "guardrails_workspace_access" ON agent_guardrails
  FOR ALL USING (
    agent_id IN (
      SELECT id FROM agents WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

-- updated_at自動更新トリガー
CREATE TRIGGER update_agent_guardrails_updated_at
  BEFORE UPDATE ON agent_guardrails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
