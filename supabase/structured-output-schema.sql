-- Structured Output: エージェントに出力スキーマを追加
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS output_schema JSONB DEFAULT NULL;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS output_schema_strict BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.agents.output_schema IS 'JSON Schemaで出力形式を定義。NULLの場合は自由形式。';
COMMENT ON COLUMN public.agents.output_schema_strict IS 'true=バリデーション失敗時エラー、false=警告のみ';
