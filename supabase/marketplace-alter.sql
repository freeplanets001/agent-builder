-- marketplace_listings に不足カラムを追加
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS install_count INTEGER DEFAULT 0;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS rating_sum INTEGER DEFAULT 0;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS snapshot_system_prompt TEXT DEFAULT '';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS snapshot_model TEXT DEFAULT '';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS snapshot_temperature NUMERIC(3,2) DEFAULT 0.7;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS snapshot_max_tokens INTEGER DEFAULT 4096;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS long_description TEXT DEFAULT '';
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
