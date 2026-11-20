-- Prompt Versioning: デプロイステータスとカナリアリリース
ALTER TABLE public.agent_versions ADD COLUMN IF NOT EXISTS deploy_status TEXT DEFAULT 'draft'
  CHECK (deploy_status IN ('draft', 'canary', 'active', 'archived'));
ALTER TABLE public.agent_versions ADD COLUMN IF NOT EXISTS canary_percent INTEGER DEFAULT 0
  CHECK (canary_percent >= 0 AND canary_percent <= 100);

COMMENT ON COLUMN public.agent_versions.deploy_status IS 'draft=下書き, canary=一部トラフィック, active=本番, archived=アーカイブ';
COMMENT ON COLUMN public.agent_versions.canary_percent IS 'カナリアリリース時のトラフィック割合(0-100%)';
