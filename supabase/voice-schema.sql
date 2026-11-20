-- Voice: 音声セッション管理 + エージェントの音声設定

-- 音声セッションテーブル
CREATE TABLE IF NOT EXISTS public.voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  tts_provider TEXT DEFAULT 'google' CHECK (tts_provider IN ('google', 'openai')),
  tts_voice TEXT DEFAULT 'default',
  language TEXT DEFAULT 'ja-JP',
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_sessions_own" ON voice_sessions
  FOR ALL USING (user_id = auth.uid());

-- エージェントにボイス設定カラムを追加
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS voice_config JSONB DEFAULT NULL;

COMMENT ON COLUMN public.agents.voice_config IS '音声設定: { enabled, tts_provider, tts_voice, language, auto_detect_language }';
