-- ============================================================
-- RAG: ナレッジベース + ベクトル検索
-- Supabase pgvector 拡張を使用
-- ============================================================

-- pgvector 拡張を有効化（Supabase は標準で利用可能）
CREATE EXTENSION IF NOT EXISTS vector;

-- ナレッジベース（ドキュメントのコレクション）
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- 紐づくエージェント（NULLならワークスペース共有）
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  -- メタデータ
  document_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  -- Embedding設定
  embedding_model TEXT DEFAULT 'text-embedding-004',
  embedding_dimensions INTEGER DEFAULT 768,
  chunk_size INTEGER DEFAULT 512,
  chunk_overlap INTEGER DEFAULT 64,
  -- ステータス
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'processing', 'error', 'archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ドキュメント（アップロードされたファイル単位）
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'text'
    CHECK (source_type IN ('text', 'markdown', 'csv', 'pdf', 'url')),
  original_content TEXT,
  content_hash TEXT,
  chunk_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- チャンク（検索・Embedding の単位）
-- embedding 列は 768次元（Gemini text-embedding-004 のデフォルト）
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  -- ベクトル埋め込み（768次元）
  embedding vector(768),
  -- メタデータ
  chunk_index INTEGER NOT NULL,
  token_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS ポリシー
-- ============================================================
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_workspace" ON knowledge_bases
  FOR ALL USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY "docs_workspace" ON knowledge_documents
  FOR ALL USING (
    knowledge_base_id IN (
      SELECT id FROM knowledge_bases WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

CREATE POLICY "chunks_workspace" ON knowledge_chunks
  FOR ALL USING (
    knowledge_base_id IN (
      SELECT id FROM knowledge_bases WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

-- ============================================================
-- インデックス
-- ============================================================

-- ベクトル検索用 HNSW インデックス（コサイン類似度）
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 通常のインデックス
CREATE INDEX IF NOT EXISTS idx_kb_workspace ON knowledge_bases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kb_agent ON knowledge_bases(agent_id);
CREATE INDEX IF NOT EXISTS idx_docs_kb ON knowledge_documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_kb ON knowledge_chunks(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON knowledge_chunks(document_id);

-- ============================================================
-- ベクトル検索関数
-- ============================================================
CREATE OR REPLACE FUNCTION search_knowledge(
  p_knowledge_base_id UUID,
  p_query_embedding vector(768),
  p_match_count INTEGER DEFAULT 5,
  p_match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT,
  document_id UUID,
  document_title TEXT,
  chunk_index INTEGER,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    1 - (kc.embedding <=> p_query_embedding) AS similarity,
    kc.document_id,
    kd.title AS document_title,
    kc.chunk_index,
    kc.metadata
  FROM knowledge_chunks kc
  JOIN knowledge_documents kd ON kd.id = kc.document_id
  WHERE kc.knowledge_base_id = p_knowledge_base_id
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY kc.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;
