-- ============================================================
-- RLSポリシー無限再帰の修正
--
-- 問題: workspace_members の SELECT ポリシーが自身をサブクエリで
--       参照しており、PostgreSQL が無限再帰エラー (42P17) を返す。
--       agents, workspaces 等のポリシーも workspace_members を
--       参照するため、同様に失敗する。
--
-- 修正: SECURITY DEFINER 関数でRLSをバイパスしてワークスペースIDを
--       取得し、各ポリシーではその関数を使う。
-- ============================================================

-- ========== ヘルパー関数 ==========

-- 現在のユーザーが所属するワークスペースIDを返す
CREATE OR REPLACE FUNCTION public.get_my_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid();
$$;

-- 指定ワークスペースでadmin/ownerかどうか
CREATE OR REPLACE FUNCTION public.is_workspace_admin(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

-- 指定ワークスペースでeditor以上かどうか
CREATE OR REPLACE FUNCTION public.is_workspace_editor(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'editor')
  );
$$;

-- ========== workspace_members ポリシー ==========

DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

DROP POLICY IF EXISTS "workspace_members_insert_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_insert_admin" ON public.workspace_members
  FOR INSERT WITH CHECK (
    public.is_workspace_admin(workspace_id)
  );

DROP POLICY IF EXISTS "workspace_members_delete_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_delete_admin" ON public.workspace_members
  FOR DELETE USING (
    public.is_workspace_admin(workspace_id)
  );

-- ========== workspaces ポリシー ==========

DROP POLICY IF EXISTS "workspaces_select_member" ON public.workspaces;
CREATE POLICY "workspaces_select_member" ON public.workspaces
  FOR SELECT USING (
    id IN (SELECT public.get_my_workspace_ids())
  );

-- ========== agents ポリシー ==========

DROP POLICY IF EXISTS "agents_select_member" ON public.agents;
CREATE POLICY "agents_select_member" ON public.agents
  FOR SELECT USING (
    visibility = 'public' OR
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

DROP POLICY IF EXISTS "agents_insert_editor" ON public.agents;
CREATE POLICY "agents_insert_editor" ON public.agents
  FOR INSERT WITH CHECK (
    public.is_workspace_editor(workspace_id)
  );

DROP POLICY IF EXISTS "agents_update_editor" ON public.agents;
CREATE POLICY "agents_update_editor" ON public.agents
  FOR UPDATE USING (
    public.is_workspace_editor(workspace_id)
  );

DROP POLICY IF EXISTS "agents_delete_admin" ON public.agents;
CREATE POLICY "agents_delete_admin" ON public.agents
  FOR DELETE USING (
    public.is_workspace_admin(workspace_id)
  );

-- ========== flows ポリシー ==========

DROP POLICY IF EXISTS "flows_select_member" ON public.flows;
CREATE POLICY "flows_select_member" ON public.flows
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

DROP POLICY IF EXISTS "flows_insert_editor" ON public.flows;
CREATE POLICY "flows_insert_editor" ON public.flows
  FOR INSERT WITH CHECK (
    public.is_workspace_editor(workspace_id)
  );

DROP POLICY IF EXISTS "flows_update_editor" ON public.flows;
CREATE POLICY "flows_update_editor" ON public.flows
  FOR UPDATE USING (
    public.is_workspace_editor(workspace_id)
  );

DROP POLICY IF EXISTS "flows_delete_admin" ON public.flows;
CREATE POLICY "flows_delete_admin" ON public.flows
  FOR DELETE USING (
    public.is_workspace_admin(workspace_id)
  );

-- ========== execution_logs ポリシー ==========

DROP POLICY IF EXISTS "execution_logs_select_member" ON public.execution_logs;
CREATE POLICY "execution_logs_select_member" ON public.execution_logs
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

-- ========== api_keys ポリシー ==========

DROP POLICY IF EXISTS "api_keys_select_member" ON public.api_keys;
CREATE POLICY "api_keys_select_member" ON public.api_keys
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );

DROP POLICY IF EXISTS "api_keys_insert_admin" ON public.api_keys;
CREATE POLICY "api_keys_insert_admin" ON public.api_keys
  FOR INSERT WITH CHECK (
    public.is_workspace_admin(workspace_id)
  );

DROP POLICY IF EXISTS "api_keys_update_admin" ON public.api_keys;
CREATE POLICY "api_keys_update_admin" ON public.api_keys
  FOR UPDATE USING (
    public.is_workspace_admin(workspace_id)
  );

-- ========== usage_stats ポリシー ==========

DROP POLICY IF EXISTS "usage_stats_select_member" ON public.usage_stats;
CREATE POLICY "usage_stats_select_member" ON public.usage_stats
  FOR SELECT USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
  );
