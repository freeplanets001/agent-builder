-- Web Browseツール: agent_tools.tool_type に 'web_browse' を追加
-- 既存の CHECK 制約を更新

ALTER TABLE public.agent_tools
  DROP CONSTRAINT IF EXISTS agent_tools_tool_type_check;

ALTER TABLE public.agent_tools
  ADD CONSTRAINT agent_tools_tool_type_check
    CHECK (tool_type IN (
      'web_search', 'web_browse', 'code_execution', 'file_read', 'file_write',
      'http_request', 'database_query', 'image_generation', 'custom'
    ));
