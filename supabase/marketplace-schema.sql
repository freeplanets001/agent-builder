-- エージェントマーケットプレイステーブル
-- エージェントを公開・検索・インポートする

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  published_by UUID NOT NULL REFERENCES auth.users(id),
  -- 公開情報（元のエージェントとは独立にカスタマイズ可能）
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN (
      'general', 'writing', 'coding', 'analysis', 'creative',
      'business', 'education', 'research', 'image', 'automation'
    )),
  tags TEXT[] DEFAULT '{}',
  thumbnail_url TEXT,
  -- メトリクス
  install_count INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  -- ステータス
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'unlisted', 'suspended')),
  -- スナップショット（インポート時に使う、元のエージェントが削除されても残る）
  snapshot_system_prompt TEXT NOT NULL,
  snapshot_model TEXT NOT NULL,
  snapshot_temperature NUMERIC(3,2) NOT NULL,
  snapshot_max_tokens INTEGER NOT NULL,
  -- タイムスタンプ
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- マーケットプレイスレビュー
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

-- RLS
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;

-- 公開リスティングは全員閲覧可能
CREATE POLICY "listings_read" ON marketplace_listings
  FOR SELECT USING (
    status = 'published'
    OR workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY "listings_write" ON marketplace_listings
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "reviews_read" ON marketplace_reviews
  FOR SELECT USING (true);

CREATE POLICY "reviews_write" ON marketplace_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_listings_status ON marketplace_listings(status, category);
CREATE INDEX IF NOT EXISTS idx_listings_install ON marketplace_listings(install_count DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON marketplace_reviews(listing_id);
