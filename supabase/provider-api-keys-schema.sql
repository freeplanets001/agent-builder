-- ============================================================
-- プロバイダーAPIキー管理テーブル
--
-- ワークスペース単位でAIプロバイダーのAPIキーを暗号化保存。
-- AES-256-GCM で暗号化し、平文はDBに保存しない。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_api_keys (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id     UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- プロバイダー識別子
  provider         TEXT NOT NULL CHECK (provider IN ('anthropic', 'google', 'openai')),
  -- 暗号化されたAPIキー（AES-256-GCM）
  encrypted_key    TEXT NOT NULL,
  -- 暗号化に使用した初期化ベクトル
  iv               TEXT NOT NULL,
  -- GCM認証タグ
  auth_tag         TEXT NOT NULL,
  -- マスク表示用ヒント（例: "sk-****abcd"）
  key_hint         TEXT NOT NULL DEFAULT '',
  -- 有効/無効
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  -- 最終検証日時（接続テスト成功時に更新）
  last_verified_at TIMESTAMPTZ,
  created_by       UUID NOT NULL REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 1ワークスペースにつき1プロバイダー1キー
  UNIQUE (workspace_id, provider)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_provider_api_keys_workspace
  ON public.provider_api_keys(workspace_id);

-- RLS
ALTER TABLE public.provider_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_api_keys_select" ON public.provider_api_keys
  FOR SELECT USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY "provider_api_keys_insert" ON public.provider_api_keys
  FOR INSERT WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "provider_api_keys_update" ON public.provider_api_keys
  FOR UPDATE USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "provider_api_keys_delete" ON public.provider_api_keys
  FOR DELETE USING (public.is_workspace_admin(workspace_id));

-- updated_at トリガー
CREATE TRIGGER set_provider_api_keys_updated_at
  BEFORE UPDATE ON public.provider_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
