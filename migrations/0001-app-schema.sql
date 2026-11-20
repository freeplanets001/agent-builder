CREATE TABLE IF NOT EXISTS "agent_conversations" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT DEFAULT '新しい会話',
  "message_count" INTEGER DEFAULT 0,
  "last_message_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "is_archived" INTEGER DEFAULT 0,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_agent_conversations_agent_id" ON "agent_conversations" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_conversations_workspace_id" ON "agent_conversations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_agent_conversations_user_id" ON "agent_conversations" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_agent_conversations_created_at" ON "agent_conversations" ("created_at");
CREATE TABLE IF NOT EXISTS "agent_test_cases" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "input" TEXT NOT NULL,
  "expected_output" TEXT,
  "assertion_type" TEXT NOT NULL DEFAULT 'contains',
  "is_active" INTEGER DEFAULT 1,
  "created_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_agent_test_cases_agent_id" ON "agent_test_cases" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_test_cases_workspace_id" ON "agent_test_cases" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_agent_test_cases_created_at" ON "agent_test_cases" ("created_at");
CREATE TABLE IF NOT EXISTS "agent_test_results" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "test_case_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "actual_output" TEXT,
  "error_message" TEXT,
  "latency_ms" INTEGER,
  "cost_usd" REAL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (run_id) REFERENCES agent_test_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (test_case_id) REFERENCES agent_test_cases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_agent_test_results_run_id" ON "agent_test_results" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_agent_test_results_test_case_id" ON "agent_test_results" ("test_case_id");
CREATE INDEX IF NOT EXISTS "idx_agent_test_results_created_at" ON "agent_test_results" ("created_at");
CREATE TABLE IF NOT EXISTS "agent_test_runs" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "total_cases" INTEGER DEFAULT 0,
  "passed_cases" INTEGER DEFAULT 0,
  "failed_cases" INTEGER DEFAULT 0,
  "total_latency_ms" INTEGER DEFAULT 0,
  "total_cost_usd" REAL DEFAULT 0,
  "started_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completed_at" TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_agent_test_runs_agent_id" ON "agent_test_runs" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_test_runs_workspace_id" ON "agent_test_runs" ("workspace_id");
CREATE TABLE IF NOT EXISTS "agent_tools" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "tool_type" TEXT NOT NULL,
  "tool_name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "config" TEXT NOT NULL DEFAULT '{}',
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_agent_tools_agent_id" ON "agent_tools" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_tools_created_at" ON "agent_tools" ("created_at");
CREATE TABLE IF NOT EXISTS "agent_variables" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "default_value" TEXT,
  "required" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (agent_id, key),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_agent_variables_agent_id" ON "agent_variables" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_variables_created_at" ON "agent_variables" ("created_at");
CREATE TABLE IF NOT EXISTS "agent_versions" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "system_prompt" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "temperature" REAL NOT NULL,
  "max_tokens" INTEGER NOT NULL,
  "change_note" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "deploy_status" TEXT DEFAULT 'draft',
  "canary_percent" INTEGER DEFAULT 0,
  UNIQUE (agent_id, version),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS "idx_agent_versions_agent_id" ON "agent_versions" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_versions_created_at" ON "agent_versions" ("created_at");
CREATE TABLE IF NOT EXISTS "agents" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "system_prompt" TEXT NOT NULL,
  "model" TEXT NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
  "temperature" REAL NOT NULL DEFAULT 0.7,
  "max_tokens" INTEGER NOT NULL DEFAULT 4096,
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "is_active" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "share_token" TEXT,
  "output_schema" TEXT DEFAULT NULL,
  "output_schema_strict" INTEGER DEFAULT 0,
  "voice_config" TEXT DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE (share_token),
  FOREIGN KEY (created_by) REFERENCES profiles(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_agents_workspace_id" ON "agents" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_agents_created_at" ON "agents" ("created_at");
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "last_used_at" TEXT,
  "expires_at" TEXT,
  "is_active" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (key_hash),
  PRIMARY KEY (id),
  FOREIGN KEY (created_by) REFERENCES profiles(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_api_keys_workspace_id" ON "api_keys" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_api_keys_key_hash" ON "api_keys" ("key_hash");
CREATE INDEX IF NOT EXISTS "idx_api_keys_created_at" ON "api_keys" ("created_at");
CREATE TABLE IF NOT EXISTS "automation_runs" (
  "id" TEXT NOT NULL,
  "automation_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "steps" TEXT,
  "output" TEXT,
  "error_message" TEXT,
  "started_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ended_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_automation_runs_automation_id" ON "automation_runs" ("automation_id");
CREATE INDEX IF NOT EXISTS "idx_automation_runs_workspace_id" ON "automation_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_automation_runs_created_at" ON "automation_runs" ("created_at");
CREATE TABLE IF NOT EXISTS "automations" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "trigger_type" TEXT NOT NULL,
  "trigger_config" TEXT NOT NULL DEFAULT '{}',
  "agent_id" TEXT,
  "input_template" TEXT,
  "is_active" INTEGER NOT NULL DEFAULT 1,
  "last_run_at" TEXT,
  "next_run_at" TEXT,
  "run_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES profiles(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_automations_workspace_id" ON "automations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_automations_agent_id" ON "automations" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_automations_created_at" ON "automations" ("created_at");
CREATE TABLE IF NOT EXISTS "conversation_messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "token_count" INTEGER DEFAULT 0,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_conversation_messages_conversation_id" ON "conversation_messages" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_conversation_messages_created_at" ON "conversation_messages" ("created_at");
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT,
  "last_message_preview" TEXT,
  "message_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_conversations_agent_id" ON "conversations" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_user_id" ON "conversations" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_created_at" ON "conversations" ("created_at");
CREATE TABLE IF NOT EXISTS "custom_tools" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT,
  "created_by" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "endpoint_url" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'GET',
  "headers" TEXT DEFAULT '{}',
  "body_template" TEXT,
  "response_path" TEXT,
  "parameters" TEXT DEFAULT '[]',
  "is_active" INTEGER DEFAULT 1,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS "idx_custom_tools_workspace_id" ON "custom_tools" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_custom_tools_created_at" ON "custom_tools" ("created_at");
CREATE TABLE IF NOT EXISTS "execution_logs" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "input" TEXT NOT NULL,
  "output" TEXT,
  "variables_used" TEXT,
  "model" TEXT NOT NULL,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "cost_usd" REAL NOT NULL DEFAULT 0,
  "latency_ms" INTEGER NOT NULL DEFAULT 0,
  "feedback" TEXT,
  "error_message" TEXT,
  "started_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ended_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "debug_trace" TEXT DEFAULT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES profiles(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_execution_logs_agent_id" ON "execution_logs" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_execution_logs_conversation_id" ON "execution_logs" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_execution_logs_workspace_id" ON "execution_logs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_execution_logs_user_id" ON "execution_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_execution_logs_created_at" ON "execution_logs" ("created_at");
CREATE TABLE IF NOT EXISTS "flow_edges" (
  "id" TEXT NOT NULL,
  "flow_id" TEXT NOT NULL,
  "source_node_id" TEXT NOT NULL,
  "target_node_id" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'normal',
  "label" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES flow_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_node_id) REFERENCES flow_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_flow_edges_flow_id" ON "flow_edges" ("flow_id");
CREATE INDEX IF NOT EXISTS "idx_flow_edges_source_node_id" ON "flow_edges" ("source_node_id");
CREATE INDEX IF NOT EXISTS "idx_flow_edges_target_node_id" ON "flow_edges" ("target_node_id");
CREATE INDEX IF NOT EXISTS "idx_flow_edges_created_at" ON "flow_edges" ("created_at");
CREATE TABLE IF NOT EXISTS "flow_nodes" (
  "id" TEXT NOT NULL,
  "flow_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "position" TEXT NOT NULL DEFAULT '{"x": 0, "y": 0}',
  "agent_id" TEXT,
  "condition" TEXT,
  "data" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_flow_nodes_flow_id" ON "flow_nodes" ("flow_id");
CREATE INDEX IF NOT EXISTS "idx_flow_nodes_agent_id" ON "flow_nodes" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_flow_nodes_created_at" ON "flow_nodes" ("created_at");
CREATE TABLE IF NOT EXISTS "flows" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (created_by) REFERENCES profiles(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_flows_workspace_id" ON "flows" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_flows_created_at" ON "flows" ("created_at");
CREATE TABLE IF NOT EXISTS "image_prompt_templates" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "prompt_template" TEXT NOT NULL,
  "negative_prompt" TEXT,
  "style_category" TEXT NOT NULL DEFAULT 'general',
  "default_model" TEXT DEFAULT 'gemini-2.5-flash-image',
  "default_aspect_ratio" TEXT DEFAULT '16:9',
  "default_image_size" TEXT DEFAULT '1K',
  "is_public" INTEGER DEFAULT 0,
  "use_count" INTEGER DEFAULT 0,
  "created_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_image_prompt_templates_workspace_id" ON "image_prompt_templates" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_image_prompt_templates_created_at" ON "image_prompt_templates" ("created_at");
CREATE TABLE IF NOT EXISTS "integrations" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "config" TEXT NOT NULL DEFAULT '{}',
  "is_active" INTEGER DEFAULT 1,
  "created_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS "idx_integrations_workspace_id" ON "integrations" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_integrations_agent_id" ON "integrations" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_integrations_created_at" ON "integrations" ("created_at");
CREATE TABLE IF NOT EXISTS "knowledge_bases" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "agent_id" TEXT,
  "document_count" INTEGER DEFAULT 0,
  "chunk_count" INTEGER DEFAULT 0,
  "total_tokens" INTEGER DEFAULT 0,
  "embedding_model" TEXT DEFAULT 'text-embedding-004',
  "embedding_dimensions" INTEGER DEFAULT 768,
  "chunk_size" INTEGER DEFAULT 512,
  "chunk_overlap" INTEGER DEFAULT 64,
  "status" TEXT DEFAULT 'active',
  "created_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_knowledge_bases_workspace_id" ON "knowledge_bases" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_knowledge_bases_agent_id" ON "knowledge_bases" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_knowledge_bases_created_at" ON "knowledge_bases" ("created_at");
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "knowledge_base_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" TEXT,
  "chunk_index" INTEGER NOT NULL,
  "token_count" INTEGER DEFAULT 0,
  "metadata" TEXT DEFAULT '{}',
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_document_id" ON "knowledge_chunks" ("document_id");
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_knowledge_base_id" ON "knowledge_chunks" ("knowledge_base_id");
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_created_at" ON "knowledge_chunks" ("created_at");
CREATE TABLE IF NOT EXISTS "knowledge_documents" (
  "id" TEXT NOT NULL,
  "knowledge_base_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source_type" TEXT NOT NULL DEFAULT 'text',
  "original_content" TEXT,
  "content_hash" TEXT,
  "chunk_count" INTEGER DEFAULT 0,
  "token_count" INTEGER DEFAULT 0,
  "status" TEXT DEFAULT 'pending',
  "error_message" TEXT,
  "metadata" TEXT DEFAULT '{}',
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_knowledge_documents_knowledge_base_id" ON "knowledge_documents" ("knowledge_base_id");
CREATE INDEX IF NOT EXISTS "idx_knowledge_documents_created_at" ON "knowledge_documents" ("created_at");
CREATE TABLE IF NOT EXISTS "marketplace_listings" (
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "published_by" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "fork_count" INTEGER NOT NULL DEFAULT 0,
  "like_count" INTEGER NOT NULL DEFAULT 0,
  "review_count" INTEGER NOT NULL DEFAULT 0,
  "average_rating" REAL NOT NULL DEFAULT 0,
  "published_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "category" TEXT DEFAULT 'general',
  "status" TEXT DEFAULT 'published',
  "install_count" INTEGER DEFAULT 0,
  "rating_sum" INTEGER DEFAULT 0,
  "rating_count" INTEGER DEFAULT 0,
  "snapshot_system_prompt" TEXT DEFAULT '',
  "snapshot_model" TEXT DEFAULT '',
  "snapshot_temperature" REAL DEFAULT 0.7,
  "snapshot_max_tokens" INTEGER DEFAULT 4096,
  "long_description" TEXT DEFAULT '',
  "thumbnail_url" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (published_by) REFERENCES profiles(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_marketplace_listings_agent_id" ON "marketplace_listings" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_marketplace_listings_workspace_id" ON "marketplace_listings" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_marketplace_listings_created_at" ON "marketplace_listings" ("created_at");
CREATE TABLE IF NOT EXISTS "marketplace_reviews" (
  "id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (listing_id, user_id),
  PRIMARY KEY (id),
  FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_marketplace_reviews_listing_id" ON "marketplace_reviews" ("listing_id");
CREATE INDEX IF NOT EXISTS "idx_marketplace_reviews_user_id" ON "marketplace_reviews" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_marketplace_reviews_created_at" ON "marketplace_reviews" ("created_at");
CREATE TABLE IF NOT EXISTS "messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tool_uses" TEXT,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "attachments" TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id" ON "messages" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_messages_created_at" ON "messages" ("created_at");
CREATE TABLE IF NOT EXISTS "profiles" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "full_name" TEXT,
  "avatar_url" TEXT,
  "github_username" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS "idx_profiles_created_at" ON "profiles" ("created_at");
CREATE TABLE IF NOT EXISTS "prompt_snippets" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'system',
  "tags" TEXT DEFAULT '[]',
  "use_count" INTEGER DEFAULT 0,
  "created_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS "idx_prompt_snippets_workspace_id" ON "prompt_snippets" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_prompt_snippets_created_at" ON "prompt_snippets" ("created_at");
CREATE TABLE IF NOT EXISTS "provider_api_keys" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "encrypted_key" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "auth_tag" TEXT NOT NULL,
  "key_hint" TEXT NOT NULL DEFAULT '',
  "is_active" INTEGER NOT NULL DEFAULT 1,
  "last_verified_at" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  UNIQUE (workspace_id, provider),
  FOREIGN KEY (created_by) REFERENCES profiles(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_provider_api_keys_workspace_id" ON "provider_api_keys" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_provider_api_keys_created_at" ON "provider_api_keys" ("created_at");
CREATE TABLE IF NOT EXISTS "skill_executions" (
  "id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "original_input" TEXT NOT NULL,
  "resolved_input" TEXT NOT NULL,
  "output" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running',
  "error_message" TEXT,
  "was_auto_created" INTEGER NOT NULL DEFAULT 0,
  "latency_ms" INTEGER NOT NULL DEFAULT 0,
  "cost_usd" REAL NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_skill_executions_skill_id" ON "skill_executions" ("skill_id");
CREATE INDEX IF NOT EXISTS "idx_skill_executions_workspace_id" ON "skill_executions" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_skill_executions_user_id" ON "skill_executions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_skill_executions_created_at" ON "skill_executions" ("created_at");
CREATE TABLE IF NOT EXISTS "skill_versions" (
  "id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "system_prompt" TEXT,
  "model" TEXT,
  "temperature" REAL,
  "max_tokens" INTEGER,
  "trigger_keywords" TEXT,
  "tags" TEXT,
  "change_summary" TEXT,
  "created_by" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  UNIQUE (skill_id, version),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_skill_versions_skill_id" ON "skill_versions" ("skill_id");
CREATE INDEX IF NOT EXISTS "idx_skill_versions_created_at" ON "skill_versions" ("created_at");
CREATE TABLE IF NOT EXISTS "skills" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "skill_type" TEXT NOT NULL DEFAULT 'prompt',
  "trigger_keywords" TEXT NOT NULL DEFAULT '[]',
  "intent_description" TEXT NOT NULL DEFAULT '',
  "system_prompt" TEXT,
  "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  "temperature" REAL NOT NULL DEFAULT 0.7,
  "max_tokens" INTEGER NOT NULL DEFAULT 4096,
  "input_template" TEXT,
  "workflow_steps" TEXT,
  "agent_id" TEXT,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "is_auto_generated" INTEGER NOT NULL DEFAULT 0,
  "is_active" INTEGER NOT NULL DEFAULT 1,
  "use_count" INTEGER NOT NULL DEFAULT 0,
  "last_used_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES profiles(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_skills_workspace_id" ON "skills" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_skills_agent_id" ON "skills" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_skills_created_at" ON "skills" ("created_at");
CREATE TABLE IF NOT EXISTS "usage_stats" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "period_start" TEXT NOT NULL,
  "period_end" TEXT NOT NULL,
  "total_requests" INTEGER NOT NULL DEFAULT 0,
  "successful_requests" INTEGER NOT NULL DEFAULT 0,
  "failed_requests" INTEGER NOT NULL DEFAULT 0,
  "total_input_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_output_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_cost_usd" REAL NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_usage_stats_workspace_id" ON "usage_stats" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_usage_stats_agent_id" ON "usage_stats" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_usage_stats_created_at" ON "usage_stats" ("created_at");
CREATE TABLE IF NOT EXISTS "webhook_tokens" (
  "id" TEXT NOT NULL,
  "automation_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (automation_id),
  PRIMARY KEY (id),
  UNIQUE (token),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_webhook_tokens_automation_id" ON "webhook_tokens" ("automation_id");
CREATE INDEX IF NOT EXISTS "idx_webhook_tokens_created_at" ON "webhook_tokens" ("created_at");
CREATE TABLE IF NOT EXISTS "workspace_cost_limits" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "monthly_limit_usd" REAL DEFAULT 10.0,
  "alert_threshold_percent" INTEGER DEFAULT 80,
  "is_hard_limit" INTEGER DEFAULT 0,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  UNIQUE (workspace_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_workspace_cost_limits_workspace_id" ON "workspace_cost_limits" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_cost_limits_created_at" ON "workspace_cost_limits" ("created_at");
CREATE TABLE IF NOT EXISTS "workspace_members" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'viewer',
  "invited_by" TEXT,
  "joined_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  UNIQUE (workspace_id, user_id),
  FOREIGN KEY (invited_by) REFERENCES profiles(id),
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_workspace_members_workspace_id" ON "workspace_members" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_members_user_id" ON "workspace_members" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_workspace_members_created_at" ON "workspace_members" ("created_at");
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "avatar_url" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (id),
  UNIQUE (slug),
  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_workspaces_owner_id" ON "workspaces" ("owner_id");
CREATE INDEX IF NOT EXISTS "idx_workspaces_created_at" ON "workspaces" ("created_at");
CREATE TABLE IF NOT EXISTS "agent_memories" (
  "id" TEXT,
  "agent_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "memory_type" TEXT NOT NULL DEFAULT 'fact',
  "content" TEXT NOT NULL,
  "embedding" TEXT,
  "source_conversation_id" TEXT,
  "importance" REAL DEFAULT 0.5,
  "access_count" INTEGER DEFAULT 0,
  "last_accessed_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "expires_at" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_agent_memories_agent_id" ON "agent_memories" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_memories_workspace_id" ON "agent_memories" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_agent_memories_user_id" ON "agent_memories" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_agent_memories_source_conversation_id" ON "agent_memories" ("source_conversation_id");
CREATE INDEX IF NOT EXISTS "idx_agent_memories_created_at" ON "agent_memories" ("created_at");
CREATE TABLE IF NOT EXISTS "eval_suites" (
  "id" TEXT,
  "agent_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_eval_suites_agent_id" ON "eval_suites" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_eval_suites_workspace_id" ON "eval_suites" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_eval_suites_created_at" ON "eval_suites" ("created_at");
CREATE TABLE IF NOT EXISTS "eval_cases" (
  "id" TEXT,
  "suite_id" TEXT NOT NULL,
  "input" TEXT NOT NULL,
  "expected_output" TEXT,
  "eval_criteria" TEXT DEFAULT '{}',
  "tags" TEXT DEFAULT '[]',
  "sort_order" INTEGER DEFAULT 0,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_eval_cases_suite_id" ON "eval_cases" ("suite_id");
CREATE INDEX IF NOT EXISTS "idx_eval_cases_created_at" ON "eval_cases" ("created_at");
CREATE TABLE IF NOT EXISTS "eval_runs" (
  "id" TEXT,
  "suite_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "agent_version" INTEGER,
  "model_override" TEXT,
  "prompt_override" TEXT,
  "label" TEXT,
  "total_cases" INTEGER DEFAULT 0,
  "passed_cases" INTEGER DEFAULT 0,
  "avg_score" REAL DEFAULT 0,
  "total_cost_usd" REAL DEFAULT 0,
  "total_latency_ms" INTEGER DEFAULT 0,
  "results" TEXT DEFAULT '[]',
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completed_at" TEXT,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_eval_runs_suite_id" ON "eval_runs" ("suite_id");
CREATE INDEX IF NOT EXISTS "idx_eval_runs_agent_id" ON "eval_runs" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_eval_runs_workspace_id" ON "eval_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_eval_runs_created_at" ON "eval_runs" ("created_at");
CREATE TABLE IF NOT EXISTS "flow_runs" (
  "id" TEXT,
  "flow_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "input" TEXT NOT NULL,
  "output" TEXT,
  "node_results" TEXT DEFAULT '{}',
  "paused_at_node_id" TEXT,
  "total_cost_usd" REAL DEFAULT 0,
  "total_latency_ms" INTEGER DEFAULT 0,
  "error_message" TEXT,
  "started_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ended_at" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_flow_runs_flow_id" ON "flow_runs" ("flow_id");
CREATE INDEX IF NOT EXISTS "idx_flow_runs_workspace_id" ON "flow_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_flow_runs_user_id" ON "flow_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_flow_runs_paused_at_node_id" ON "flow_runs" ("paused_at_node_id");
CREATE INDEX IF NOT EXISTS "idx_flow_runs_created_at" ON "flow_runs" ("created_at");
CREATE TABLE IF NOT EXISTS "agent_guardrails" (
  "id" TEXT,
  "agent_id" TEXT NOT NULL,
  "input_injection_check" INTEGER DEFAULT 1,
  "input_blocked_patterns" TEXT DEFAULT '[]',
  "output_pii_check" INTEGER DEFAULT 1,
  "output_pii_mask" INTEGER DEFAULT 1,
  "output_blocked_patterns" TEXT DEFAULT '[]',
  "mode" TEXT DEFAULT 'warn',
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_agent_guardrails_agent_id" ON "agent_guardrails" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_agent_guardrails_created_at" ON "agent_guardrails" ("created_at");
CREATE TABLE IF NOT EXISTS "agent_pipelines" (
  "id" TEXT,
  "workspace_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "steps" TEXT NOT NULL DEFAULT '[]',
  "is_active" INTEGER DEFAULT 1,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_agent_pipelines_workspace_id" ON "agent_pipelines" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_agent_pipelines_created_at" ON "agent_pipelines" ("created_at");
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
  "id" TEXT,
  "pipeline_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT DEFAULT 'running',
  "input" TEXT NOT NULL,
  "output" TEXT,
  "step_results" TEXT DEFAULT '[]',
  "total_cost_usd" REAL DEFAULT 0,
  "total_latency_ms" INTEGER DEFAULT 0,
  "error_message" TEXT,
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completed_at" TEXT,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_pipeline_runs_pipeline_id" ON "pipeline_runs" ("pipeline_id");
CREATE INDEX IF NOT EXISTS "idx_pipeline_runs_workspace_id" ON "pipeline_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_pipeline_runs_user_id" ON "pipeline_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_pipeline_runs_created_at" ON "pipeline_runs" ("created_at");
CREATE TABLE IF NOT EXISTS "voice_sessions" (
  "id" TEXT,
  "agent_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tts_provider" TEXT DEFAULT 'google',
  "tts_voice" TEXT DEFAULT 'default',
  "language" TEXT DEFAULT 'ja-JP',
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ended_at" TEXT,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "idx_voice_sessions_agent_id" ON "voice_sessions" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_voice_sessions_conversation_id" ON "voice_sessions" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_voice_sessions_workspace_id" ON "voice_sessions" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_voice_sessions_user_id" ON "voice_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_voice_sessions_created_at" ON "voice_sessions" ("created_at");
