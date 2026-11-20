-- ============================================================
-- Agent Builder — Supabase スキーマ定義
-- 設計書 agent-builder-spec-v2.docx に基づく全16テーブル
-- Supabase SQL Editorでこのファイルを実行してください
-- ============================================================

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. profiles テーブル
-- auth.users と 1:1 で紐付くユーザープロファイル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  github_username TEXT,
  plan        TEXT NOT NULL DEFAULT 'free'
                CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. workspaces テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workspaces (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  avatar_url  TEXT,
  plan        TEXT NOT NULL DEFAULT 'free'
                CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. workspace_members テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  invited_by    UUID REFERENCES public.profiles(id),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

-- ============================================================
-- 4. agents テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  name          TEXT NOT NULL CHECK (char_length(name) <= 100),
  description   TEXT,
  system_prompt TEXT NOT NULL CHECK (char_length(system_prompt) <= 20000),
  model         TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  temperature   FLOAT NOT NULL DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 1),
  max_tokens    INTEGER NOT NULL DEFAULT 4096 CHECK (max_tokens > 0),
  visibility    TEXT NOT NULL DEFAULT 'private'
                  CHECK (visibility IN ('private', 'team', 'public')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  version       INTEGER NOT NULL DEFAULT 1,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. agent_versions テーブル（バージョン履歴）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agent_versions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  model         TEXT NOT NULL,
  temperature   FLOAT NOT NULL,
  max_tokens    INTEGER NOT NULL,
  change_note   TEXT,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, version)
);

-- ============================================================
-- 6. agent_tools テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agent_tools (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id    UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tool_type   TEXT NOT NULL
                CHECK (tool_type IN (
                  'web_search','code_execution','file_read','file_write',
                  'http_request','database_query','image_generation','custom'
                )),
  tool_name   TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  config      JSONB NOT NULL DEFAULT '{}',
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. agent_variables テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agent_variables (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  default_value TEXT,
  required      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, key)
);

-- ============================================================
-- 8. flows テーブル（マルチエージェントフロー）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.flows (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  name          TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. flow_nodes テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.flow_nodes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id     UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
                CHECK (type IN ('start','agent','condition','parallel','merge','human','end')),
  position    JSONB NOT NULL DEFAULT '{"x": 0, "y": 0}',
  agent_id    UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  condition   TEXT,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. flow_edges テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.flow_edges (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id         UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  source_node_id  UUID NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
  target_node_id  UUID NOT NULL REFERENCES public.flow_nodes(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'normal'
                    CHECK (type IN ('normal','true','false','error')),
  label           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. conversations テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id              UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title                 TEXT,
  last_message_preview  TEXT,
  message_count         INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. messages テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id  UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT NOT NULL,
  tool_uses        JSONB,
  input_tokens     INTEGER,
  output_tokens    INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. execution_logs テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.execution_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id         UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  conversation_id  UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id),
  status           TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running','success','error','cancelled')),
  input            TEXT NOT NULL,
  output           TEXT,
  variables_used   JSONB,
  model            TEXT NOT NULL,
  input_tokens     INTEGER NOT NULL DEFAULT 0,
  output_tokens    INTEGER NOT NULL DEFAULT 0,
  cost_usd         FLOAT NOT NULL DEFAULT 0,
  latency_ms       INTEGER NOT NULL DEFAULT 0,
  feedback         TEXT CHECK (feedback IN ('positive','negative')),
  error_message    TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 14. api_keys テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  name          TEXT NOT NULL,
  -- キーのプレフィックス表示用（例: "abk_****abc"）
  key_prefix    TEXT NOT NULL,
  -- SHA-256ハッシュ値（平文保存禁止）
  key_hash      TEXT NOT NULL UNIQUE,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 15. usage_stats テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usage_stats (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id         UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_id             UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  period_start         TIMESTAMPTZ NOT NULL,
  period_end           TIMESTAMPTZ NOT NULL,
  total_requests       INTEGER NOT NULL DEFAULT 0,
  successful_requests  INTEGER NOT NULL DEFAULT 0,
  failed_requests      INTEGER NOT NULL DEFAULT 0,
  total_input_tokens   BIGINT NOT NULL DEFAULT 0,
  total_output_tokens  BIGINT NOT NULL DEFAULT 0,
  total_cost_usd       FLOAT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 16. marketplace_listings テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id       UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  published_by   UUID NOT NULL REFERENCES public.profiles(id),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  fork_count     INTEGER NOT NULL DEFAULT 0,
  like_count     INTEGER NOT NULL DEFAULT 0,
  review_count   INTEGER NOT NULL DEFAULT 0,
  average_rating FLOAT NOT NULL DEFAULT 0 CHECK (average_rating >= 0 AND average_rating <= 5),
  published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- インデックス定義
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_agents_workspace_id ON public.agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_created_by ON public.agents(created_by);
CREATE INDEX IF NOT EXISTS idx_agents_tags ON public.agents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_agent_tools_agent_id ON public.agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_variables_agent_id ON public.agent_variables(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_versions_agent_id ON public.agent_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_flows_workspace_id ON public.flows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow_id ON public.flow_nodes(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_edges_flow_id ON public.flow_edges(flow_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON public.conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_agent_id ON public.execution_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_workspace_id ON public.execution_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_user_id ON public.execution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON public.execution_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_tags ON public.marketplace_listings USING GIN(tags);

-- ============================================================
-- トリガー: updated_at を自動更新
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trigger_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trigger_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trigger_flows_updated_at
  BEFORE UPDATE ON public.flows
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trigger_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trigger_marketplace_listings_updated_at
  BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- トリガー: auth.users → profiles を自動作成
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- トリガー: ユーザー登録時にデフォルトワークスペースを自動作成
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER AS $$
DECLARE
  workspace_id UUID;
  workspace_slug TEXT;
BEGIN
  workspace_slug := regexp_replace(
    lower(split_part(NEW.email, '@', 1)),
    '[^a-z0-9]', '-', 'g'
  ) || '-' || substr(NEW.id::TEXT, 1, 8);

  INSERT INTO public.workspaces (owner_id, name, slug)
  VALUES (NEW.id, split_part(NEW.email, '@', 1) || 'のワークスペース', workspace_slug)
  RETURNING id INTO workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (workspace_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- ============================================================
-- Row Level Security (RLS) の有効化
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS ヘルパー関数（SECURITY DEFINER で RLS をバイパス）
-- workspace_members の自己参照による無限再帰を回避する
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_editor(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
  );
$$;

-- ============================================================
-- RLS ポリシー定義
-- ============================================================

-- profiles: 自分のプロファイルのみ読み書き可
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- workspaces: メンバーのみ参照可、オーナーのみ更新可
CREATE POLICY "workspaces_select_member" ON public.workspaces
  FOR SELECT USING (
    id IN (SELECT public.get_my_workspace_ids())
  );

CREATE POLICY "workspaces_insert_own" ON public.workspaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "workspaces_update_owner" ON public.workspaces
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "workspaces_delete_owner" ON public.workspaces
  FOR DELETE USING (owner_id = auth.uid());

-- workspace_members
CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

CREATE POLICY "workspace_members_insert_admin" ON public.workspace_members
  FOR INSERT WITH CHECK (
    public.is_workspace_admin(workspace_id)
  );

CREATE POLICY "workspace_members_delete_admin" ON public.workspace_members
  FOR DELETE USING (
    public.is_workspace_admin(workspace_id)
  );

-- agents: ワークスペースメンバーのみ + 公開エージェントは誰でも読める
CREATE POLICY "agents_select_member" ON public.agents
  FOR SELECT USING (
    visibility = 'public' OR
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

CREATE POLICY "agents_insert_editor" ON public.agents
  FOR INSERT WITH CHECK (
    public.is_workspace_editor(workspace_id)
  );

CREATE POLICY "agents_update_editor" ON public.agents
  FOR UPDATE USING (
    public.is_workspace_editor(workspace_id)
  );

CREATE POLICY "agents_delete_admin" ON public.agents
  FOR DELETE USING (
    public.is_workspace_admin(workspace_id)
  );

-- agent_versions
CREATE POLICY "agent_versions_select" ON public.agent_versions
  FOR SELECT USING (
    agent_id IN (SELECT id FROM public.agents)
  );

CREATE POLICY "agent_versions_insert" ON public.agent_versions
  FOR INSERT WITH CHECK (
    agent_id IN (SELECT id FROM public.agents)
  );

-- agent_tools
CREATE POLICY "agent_tools_select" ON public.agent_tools
  FOR SELECT USING (agent_id IN (SELECT id FROM public.agents));

CREATE POLICY "agent_tools_insert" ON public.agent_tools
  FOR INSERT WITH CHECK (agent_id IN (SELECT id FROM public.agents));

CREATE POLICY "agent_tools_update" ON public.agent_tools
  FOR UPDATE USING (agent_id IN (SELECT id FROM public.agents));

CREATE POLICY "agent_tools_delete" ON public.agent_tools
  FOR DELETE USING (agent_id IN (SELECT id FROM public.agents));

-- agent_variables
CREATE POLICY "agent_variables_select" ON public.agent_variables
  FOR SELECT USING (agent_id IN (SELECT id FROM public.agents));

CREATE POLICY "agent_variables_insert" ON public.agent_variables
  FOR INSERT WITH CHECK (agent_id IN (SELECT id FROM public.agents));

CREATE POLICY "agent_variables_update" ON public.agent_variables
  FOR UPDATE USING (agent_id IN (SELECT id FROM public.agents));

CREATE POLICY "agent_variables_delete" ON public.agent_variables
  FOR DELETE USING (agent_id IN (SELECT id FROM public.agents));

-- flows
CREATE POLICY "flows_select_member" ON public.flows
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

CREATE POLICY "flows_insert_editor" ON public.flows
  FOR INSERT WITH CHECK (
    public.is_workspace_editor(workspace_id)
  );

CREATE POLICY "flows_update_editor" ON public.flows
  FOR UPDATE USING (
    public.is_workspace_editor(workspace_id)
  );

CREATE POLICY "flows_delete_admin" ON public.flows
  FOR DELETE USING (
    public.is_workspace_admin(workspace_id)
  );

-- flow_nodes & flow_edges: flowへのアクセス権を継承
CREATE POLICY "flow_nodes_select" ON public.flow_nodes
  FOR SELECT USING (flow_id IN (SELECT id FROM public.flows));

CREATE POLICY "flow_nodes_insert" ON public.flow_nodes
  FOR INSERT WITH CHECK (flow_id IN (SELECT id FROM public.flows));

CREATE POLICY "flow_nodes_update" ON public.flow_nodes
  FOR UPDATE USING (flow_id IN (SELECT id FROM public.flows));

CREATE POLICY "flow_nodes_delete" ON public.flow_nodes
  FOR DELETE USING (flow_id IN (SELECT id FROM public.flows));

CREATE POLICY "flow_edges_select" ON public.flow_edges
  FOR SELECT USING (flow_id IN (SELECT id FROM public.flows));

CREATE POLICY "flow_edges_insert" ON public.flow_edges
  FOR INSERT WITH CHECK (flow_id IN (SELECT id FROM public.flows));

CREATE POLICY "flow_edges_update" ON public.flow_edges
  FOR UPDATE USING (flow_id IN (SELECT id FROM public.flows));

CREATE POLICY "flow_edges_delete" ON public.flow_edges
  FOR DELETE USING (flow_id IN (SELECT id FROM public.flows));

-- conversations & messages: 自分の会話のみ
CREATE POLICY "conversations_select_own" ON public.conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "conversations_insert_own" ON public.conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "conversations_update_own" ON public.conversations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT USING (
    conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid())
  );

CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT WITH CHECK (
    conversation_id IN (SELECT id FROM public.conversations WHERE user_id = auth.uid())
  );

-- execution_logs: ワークスペースメンバーのみ
CREATE POLICY "execution_logs_select_member" ON public.execution_logs
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

CREATE POLICY "execution_logs_insert_own" ON public.execution_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "execution_logs_update_own" ON public.execution_logs
  FOR UPDATE USING (user_id = auth.uid());

-- api_keys: ワークスペースメンバーのみ参照、admin以上のみ作成
CREATE POLICY "api_keys_select_member" ON public.api_keys
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

CREATE POLICY "api_keys_insert_admin" ON public.api_keys
  FOR INSERT WITH CHECK (
    public.is_workspace_admin(workspace_id)
  );

CREATE POLICY "api_keys_update_admin" ON public.api_keys
  FOR UPDATE USING (
    public.is_workspace_admin(workspace_id)
  );

-- usage_stats: ワークスペースメンバーのみ参照
CREATE POLICY "usage_stats_select_member" ON public.usage_stats
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

-- marketplace_listings: 公開済みは誰でも、それ以外はワークスペースメンバーのみ
CREATE POLICY "marketplace_listings_select" ON public.marketplace_listings
  FOR SELECT USING (TRUE);

CREATE POLICY "marketplace_listings_insert_editor" ON public.marketplace_listings
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "marketplace_listings_update_editor" ON public.marketplace_listings
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "marketplace_listings_delete_admin" ON public.marketplace_listings
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
