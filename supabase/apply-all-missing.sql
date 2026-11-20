-- ============================================================
-- 未作成テーブル一括適用SQL
-- Supabase SQL Editor で実行してください
-- ============================================================

-- 1. エージェントテストケース
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

-- 2. 画像プロンプトテンプレート
CREATE TABLE IF NOT EXISTS image_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  negative_prompt TEXT,
  style_category TEXT NOT NULL DEFAULT 'general',
  default_model TEXT DEFAULT 'gemini-2.5-flash-image',
  default_aspect_ratio TEXT DEFAULT '16:9',
  default_image_size TEXT DEFAULT '1K',
  is_public BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- デフォルトテンプレート
INSERT INTO image_prompt_templates (name, description, prompt_template, style_category, is_public) VALUES
  ('フォトリアリスティック', 'プロ品質の写真風画像', '{{subject}}, photorealistic, ultra detailed, professional photography, natural lighting, 8K resolution', 'photorealistic', true),
  ('アニメスタイル', '日本のアニメ風イラスト', '{{subject}}, anime style, vibrant colors, detailed illustration, studio ghibli inspired, high quality anime art', 'anime', true),
  ('水彩画', '柔らかい水彩画タッチ', '{{subject}}, watercolor painting, soft colors, artistic brush strokes, delicate, dreamy atmosphere, fine art', 'watercolor', true),
  ('油絵', 'クラシックな油絵風', '{{subject}}, oil painting, rich colors, textured canvas, classical art style, masterful brushwork, museum quality', 'oil_painting', true),
  ('ピクセルアート', 'レトロゲーム風', '{{subject}}, pixel art, 16-bit style, retro gaming aesthetic, clean pixels, vibrant palette', 'pixel_art', true),
  ('サイバーパンク', '近未来サイバーパンク風', '{{subject}}, cyberpunk style, neon lights, futuristic, dark atmosphere, high tech low life, rain, holographic', 'cyberpunk', true),
  ('ファンタジー', 'ファンタジーアート', '{{subject}}, fantasy art, magical atmosphere, epic composition, dramatic lighting, mythical, enchanted', 'fantasy', true)
ON CONFLICT DO NOTHING;

-- 3. スキルバージョン管理
CREATE TABLE IF NOT EXISTS skill_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  system_prompt TEXT,
  model TEXT,
  temperature NUMERIC(3,2),
  max_tokens INTEGER,
  trigger_keywords TEXT[],
  tags TEXT[],
  change_summary TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(skill_id, version)
);

-- 4. コスト上限
CREATE TABLE IF NOT EXISTS workspace_cost_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  monthly_limit_usd NUMERIC(10,4) DEFAULT 10.0,
  alert_threshold_percent INTEGER DEFAULT 80,
  is_hard_limit BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. 会話メモリ
CREATE TABLE IF NOT EXISTS agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT DEFAULT '新しい会話',
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  token_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE agent_test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_cost_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "test_cases_ws" ON agent_test_cases FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "test_runs_ws" ON agent_test_runs FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "test_results_ws" ON agent_test_results FOR ALL USING (run_id IN (SELECT id FROM agent_test_runs WHERE workspace_id IN (SELECT get_my_workspace_ids())));
CREATE POLICY "templates_read" ON image_prompt_templates FOR SELECT USING (is_public = true OR workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "templates_write" ON image_prompt_templates FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "skill_versions_ws" ON skill_versions FOR ALL USING (skill_id IN (SELECT id FROM skills WHERE workspace_id IN (SELECT get_my_workspace_ids())));
CREATE POLICY "cost_limits_ws" ON workspace_cost_limits FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "conversations_ws" ON agent_conversations FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY "messages_ws" ON conversation_messages FOR ALL USING (conversation_id IN (SELECT id FROM agent_conversations WHERE workspace_id IN (SELECT get_my_workspace_ids())));

-- ============================================================
-- インデックス
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_test_cases_agent ON agent_test_cases(agent_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_agent ON agent_test_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_test_results_run ON agent_test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON image_prompt_templates(style_category);
CREATE INDEX IF NOT EXISTS idx_skill_versions_skill ON skill_versions(skill_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON agent_conversations(agent_id, user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON conversation_messages(conversation_id, created_at);
