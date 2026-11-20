-- Agent Memory: エージェントの長期記憶システム
-- ベクトル検索で関連メモリを取得し、プロンプトに注入する

CREATE TABLE IF NOT EXISTS public.agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  -- メモリの種類
  memory_type TEXT NOT NULL DEFAULT 'fact'
    CHECK (memory_type IN ('fact', 'preference', 'instruction', 'context')),
  -- メモリの内容
  content TEXT NOT NULL,
  -- ベクトル埋め込み（768次元、ナレッジベースと同じ）
  embedding vector(768),
  -- メタデータ
  source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  importance FLOAT DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memories_workspace_access" ON agent_memories
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_user ON agent_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON agent_memories
  USING hnsw (embedding vector_cosine_ops);

-- メモリ検索関数（類似度 × 重要度でランキング）
CREATE OR REPLACE FUNCTION search_agent_memories(
  p_agent_id UUID,
  p_user_id UUID,
  p_query_embedding vector(768),
  p_match_count INTEGER DEFAULT 5,
  p_match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  importance FLOAT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id, am.content, am.memory_type, am.importance,
    1 - (am.embedding <=> p_query_embedding) AS similarity,
    am.created_at
  FROM agent_memories am
  WHERE am.agent_id = p_agent_id
    AND am.user_id = p_user_id
    AND am.embedding IS NOT NULL
    AND (am.expires_at IS NULL OR am.expires_at > now())
    AND 1 - (am.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY
    (1 - (am.embedding <=> p_query_embedding)) * am.importance DESC
  LIMIT p_match_count;
END;
$$;

-- updated_atトリガー
CREATE TRIGGER update_agent_memories_updated_at
  BEFORE UPDATE ON agent_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
