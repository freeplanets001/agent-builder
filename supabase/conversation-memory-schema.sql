-- エージェント会話メモリテーブル
-- 会話履歴を保持し、次回実行時にコンテキストとして渡す

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

-- RLS
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_workspace" ON agent_conversations
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "messages_workspace" ON conversation_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM agent_conversations WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

-- インデックス
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON agent_conversations(agent_id, user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id, created_at);
