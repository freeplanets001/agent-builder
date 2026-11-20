-- ============================================================
-- マルチモーダルエージェント対応: messages.attachments カラム追加
-- フォーマット: [{ "type": "image", "mimeType": "image/png", "data": "base64..." }]
-- ============================================================

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;

COMMENT ON COLUMN public.messages.attachments IS '添付ファイル配列。各要素は { type, mimeType, data(base64) }';
