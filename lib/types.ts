/**
 * Agent Builder — 全型定義
 * 設計書 agent-builder-spec-v2.docx に基づく
 */

// ============================================================
// 定数 / Enum
// ============================================================

/** 利用可能なAIモデル名 */
export type ModelName =
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "claude-opus-4-5"
  | "claude-sonnet-4-5"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-haiku-20241022"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash";

/** エージェントツール種別 */
export type ToolType =
  | "web_search"
  | "web_browse"
  | "code_execution"
  | "file_read"
  | "file_write"
  | "http_request"
  | "database_query"
  | "image_generation"
  | "knowledge_search"
  | "custom";

/** 実行ログのステータス */
export type LogStatus = "running" | "success" | "error" | "cancelled";

/** マルチエージェントフローのノード種別 */
export type FlowNodeType =
  | "start"
  | "agent"
  | "condition"
  | "parallel"
  | "merge"
  | "human"
  | "end";

/** フローエッジの種別 */
export type FlowEdgeType = "normal" | "true" | "false" | "error";

/** ワークスペースメンバーのロール */
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

/** エージェントの公開状態 */
export type AgentVisibility = "private" | "team" | "public";

/** Supabase Authユーザー（プロフィール拡張） */
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  github_username: string | null;
  plan: "free" | "pro" | "team" | "enterprise";
  created_at: string;
  updated_at: string;
}

// ============================================================
// エージェント関連
// ============================================================

/** エージェントツール設定 */
export interface AgentTool {
  id: string;
  agent_id: string;
  tool_type: ToolType;
  tool_name: string;
  description: string;
  /** ツール固有の設定（JSON） */
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

/** エージェントプロンプト変数 */
export interface AgentVariable {
  id: string;
  agent_id: string;
  key: string;
  label: string;
  description: string | null;
  default_value: string | null;
  required: boolean;
  created_at: string;
}

/** エージェント本体 */
export interface Agent {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model: ModelName;
  /** 温度パラメータ (0.0〜1.0) */
  temperature: number;
  /** 最大出力トークン数 */
  max_tokens: number;
  visibility: AgentVisibility;
  is_active: boolean;
  /** 現在のバージョン番号 */
  version: number;
  /** タグ一覧 */
  tags: string[];
  /** 出力JSON Schema（NULLなら自由形式） */
  output_schema: Record<string, unknown> | null;
  /** スキーマ厳密モード（true=失敗時エラー、false=警告のみ） */
  output_schema_strict: boolean;
  tools?: AgentTool[];
  variables?: AgentVariable[];
  created_at: string;
  updated_at: string;
}

/** エージェント作成リクエスト */
export type CreateAgentRequest = Omit<
  Agent,
  "id" | "workspace_id" | "created_by" | "version" | "tools" | "variables" | "created_at" | "updated_at" | "output_schema" | "output_schema_strict"
> & {
  output_schema?: Record<string, unknown> | null;
  output_schema_strict?: boolean;
};

/** エージェント更新リクエスト */
export type UpdateAgentRequest = Partial<CreateAgentRequest>;

/** エージェントバージョン履歴 */
export interface AgentVersion {
  id: string;
  agent_id: string;
  version: number;
  system_prompt: string;
  model: ModelName;
  temperature: number;
  max_tokens: number;
  /** 変更コメント */
  change_note: string | null;
  created_by: string;
  created_at: string;
}

// ============================================================
// 実行関連
// ============================================================

/** エージェント実行リクエスト */
export interface AgentRunRequest {
  /** ユーザーの入力テキスト */
  input: string;
  /** 変数の値マップ */
  variables?: Record<string, string>;
  /** 会話セッションID（継続の場合） */
  conversation_id?: string;
  /** ストリーミング有効フラグ */
  stream?: boolean;
  /** 画像添付（マルチモーダル対応） */
  images?: Array<{ base64: string; mimeType: string }>;
}

/** エージェント実行レスポンス（非ストリーミング） */
export interface AgentRunResponse {
  output: string;
  conversation_id: string;
  log_id: string;
  /** レイテンシ（ミリ秒） */
  latency_ms: number;
  /** 入力トークン数 */
  input_tokens: number;
  /** 出力トークン数 */
  output_tokens: number;
  /** コスト（USD） */
  cost_usd: number;
}

/** SSEストリーミングイベント */
export interface StreamEvent {
  type: "text_delta" | "tool_use" | "tool_result" | "done" | "error" | "cost_warning";
  content?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: unknown;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  error?: string;
}

/** 実行ログ */
export interface ExecutionLog {
  id: string;
  agent_id: string;
  conversation_id: string | null;
  workspace_id: string;
  user_id: string;
  status: LogStatus;
  input: string;
  output: string | null;
  variables_used: Record<string, string> | null;
  model: ModelName;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  /** ユーザーフィードバック */
  feedback: "positive" | "negative" | null;
  error_message: string | null;
  /** デバッグトレース */
  debug_trace?: Array<{
    timestamp: string;
    event: string;
    duration_ms?: number;
    data: Record<string, unknown>;
  }> | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

/** 会話セッション */
export interface Conversation {
  id: string;
  agent_id: string;
  user_id: string;
  title: string | null;
  /** 最終メッセージの概要 */
  last_message_preview: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

/** 添付ファイル（画像等） */
export interface MessageAttachment {
  type: "image";
  mimeType: string;
  data: string; // Base64エンコード
}

/** 会話メッセージ */
export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** 添付ファイル（画像等） */
  attachments?: MessageAttachment[] | null;
  /** ツール使用情報 */
  tool_uses?: Array<{
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_result: unknown;
  }>;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

// ============================================================
// マルチエージェントフロー
// ============================================================

/** フローノード */
export interface FlowNode {
  id: string;
  flow_id: string;
  type: FlowNodeType;
  /** ノードの表示位置 */
  position: { x: number; y: number };
  /** ノードに紐付くエージェントID（typeがagentの場合） */
  agent_id?: string;
  /** 条件式（typeがconditionの場合） */
  condition?: string;
  /** ノード固有の設定 */
  data: Record<string, unknown>;
  created_at: string;
}

/** フローエッジ */
export interface FlowEdge {
  id: string;
  flow_id: string;
  source_node_id: string;
  target_node_id: string;
  type: FlowEdgeType;
  /** エッジのラベル */
  label?: string;
  created_at: string;
}

/** マルチエージェントフロー */
export interface Flow {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  description: string | null;
  is_active: boolean;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  created_at: string;
  updated_at: string;
}

/** フロー実行リクエスト */
export interface FlowRunRequest {
  input: string;
  variables?: Record<string, string>;
}

/** フロー実行ステータス */
export type FlowRunStatus = "running" | "paused" | "success" | "error" | "cancelled";

/** フローノードの実行結果 */
export interface FlowNodeResult {
  node_id: string;
  node_type: FlowNodeType;
  status: "pending" | "running" | "success" | "error" | "skipped" | "paused";
  input: string;
  output: string | null;
  agent_id?: string;
  cost_usd: number;
  latency_ms: number;
  started_at: string;
  ended_at: string | null;
}

/** フロー実行レコード */
export interface FlowRun {
  id: string;
  flow_id: string;
  workspace_id: string;
  user_id: string;
  status: FlowRunStatus;
  input: string;
  output: string | null;
  node_results: Record<string, FlowNodeResult>;
  paused_at_node_id: string | null;
  total_cost_usd: number;
  total_latency_ms: number;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

// ============================================================
// チーム・ワークスペース
// ============================================================

/** ワークスペース */
export interface Workspace {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  plan: "free" | "pro" | "team" | "enterprise";
  created_at: string;
  updated_at: string;
}

/** ワークスペースメンバー */
export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  profile?: Profile;
}

// ============================================================
// APIキー管理
// ============================================================

/** APIキー（一覧表示用 — 平文シークレットは含まない） */
export interface ApiKey {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  /** キーのプレフィックス表示用（例: "abk_****abc"） */
  key_prefix: string;
  /** SHA-256ハッシュ値 */
  key_hash: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

/** APIキー作成レスポンス（シークレットは作成時のみ返す） */
export interface ApiKeyCreateResponse {
  api_key: ApiKey;
  /** 平文シークレット（一度だけ返される） */
  secret: string;
}

// ============================================================
// 使用量統計
// ============================================================

/** 使用量統計 */
export interface UsageStat {
  id: string;
  workspace_id: string;
  agent_id: string | null;
  period_start: string;
  period_end: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  created_at: string;
}

// ============================================================
// マーケットプレイス
// ============================================================

/** マーケットプレイス公開エージェント */
export interface MarketplaceListing {
  id: string;
  agent_id: string;
  workspace_id: string;
  published_by: string;
  title: string;
  description: string;
  tags: string[];
  /** フォーク数 */
  fork_count: number;
  /** いいね数 */
  like_count: number;
  /** レビュー数 */
  review_count: number;
  /** 平均評価 (0.0〜5.0) */
  average_rating: number;
  published_at: string;
  updated_at: string;
  agent?: Agent;
}

// ============================================================
// 自動化
// ============================================================

/** 自動化のトリガー種別 */
export type AutomationTriggerType = "schedule" | "webhook" | "workflow";

/** スケジュールトリガー設定 */
export interface ScheduleTriggerConfig {
  cron: string;
  timezone: string;
}

/** Webhookトリガー設定 */
export interface WebhookTriggerConfig {
  secret?: string;
  allowed_ips?: string[];
}

/** ワークフローステップ */
export interface WorkflowStep {
  agent_id: string;
  agent_name?: string;
  /** 入力テンプレート。前ステップの出力を {{prev_output}} で参照可能 */
  input_template: string;
}

/** ワークフロートリガー設定 */
export interface WorkflowTriggerConfig {
  steps: WorkflowStep[];
}

/** 自動化ルール */
export interface Automation {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  description: string | null;
  trigger_type: AutomationTriggerType;
  trigger_config: ScheduleTriggerConfig | WebhookTriggerConfig | WorkflowTriggerConfig;
  agent_id: string | null;
  input_template: string | null;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
  /** 結合時に含まれるエージェント名 */
  agents?: { name: string };
}

/** 自動化の実行履歴 */
export interface AutomationRun {
  id: string;
  automation_id: string;
  workspace_id: string;
  status: LogStatus;
  steps: Array<{ agent_id: string; input: string; output: string; status: string }> | null;
  output: string | null;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

// ============================================================
// スキルレジストリ（自己拡張エージェント基盤）
// ============================================================

/** スキルの種別 */
export type SkillType = "prompt" | "command" | "workflow";

/** スキル定義 */
export interface Skill {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  description: string;
  skill_type: SkillType;
  /** マッチング用キーワード */
  trigger_keywords: string[];
  /** AIが意図マッチングに使う自然言語の説明 */
  intent_description: string;
  system_prompt: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  input_template: string | null;
  workflow_steps: WorkflowStep[] | null;
  agent_id: string | null;
  tags: string[];
  is_auto_generated: boolean;
  is_active: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** スキル実行履歴 */
export interface SkillExecution {
  id: string;
  skill_id: string;
  workspace_id: string;
  user_id: string;
  original_input: string;
  resolved_input: string;
  output: string | null;
  status: "running" | "success" | "error";
  error_message: string | null;
  was_auto_created: boolean;
  latency_ms: number;
  cost_usd: number;
  created_at: string;
}

/** オーケストレーターの判定結果 */
export interface OrchestratorResult {
  /** マッチしたスキル、または新規生成したスキル */
  skill: Skill;
  /** マッチ方法: existing=既存, created=新規生成 */
  match_type: "existing" | "created";
  /** 実行結果 */
  execution: SkillExecution;
  /** スキルの出力 */
  output: string;
}

// ============================================================
// APIエラーレスポンス
// ============================================================

// ============================================================
// Voice / Audio
// ============================================================

/** エージェントの音声設定 */
export interface VoiceConfig {
  enabled: boolean;
  tts_provider: "google" | "openai";
  tts_voice: string;
  language: string;
  auto_detect_language: boolean;
}

/** TTS オプション */
export interface TTSOptions {
  voice: string;
  language: string;
  speed?: number;
}

/** TTS レスポンス */
export interface TTSResponse {
  audioBase64: string;
  mimeType: string;
  durationMs?: number;
}

/** 統一APIエラーレスポンス */
export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

// ============================================================
// 評価フレームワーク
// ============================================================

/** 評価テストスイート */
export interface EvalSuite {
  id: string;
  agent_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** 評価テストケース */
export interface EvalCase {
  id: string;
  suite_id: string;
  input: string;
  expected_output: string | null;
  eval_criteria: {
    type: "exact" | "contains" | "keywords" | "ai_judge" | "regex";
    keywords?: string[];
    pattern?: string;
    threshold?: number;
  };
  tags: string[];
  sort_order: number;
  created_at: string;
}

/** 評価実行結果（個別ケース） */
export interface EvalCaseResult {
  case_id: string;
  input: string;
  expected: string | null;
  actual: string;
  score: number;
  passed: boolean;
  reason: string;
  latency_ms: number;
  cost_usd: number;
}

/** 評価実行レコード */
export interface EvalRun {
  id: string;
  suite_id: string;
  agent_id: string;
  workspace_id: string;
  agent_version: number;
  model_override: string | null;
  prompt_override: string | null;
  label: string | null;
  status: "running" | "success" | "error";
  total_cases: number;
  passed_cases: number;
  avg_score: number;
  total_cost_usd: number;
  total_latency_ms: number;
  results: EvalCaseResult[];
  created_by: string;
  created_at: string;
  completed_at: string | null;
}

// ============================================================
// プロンプトバージョニング
// ============================================================

/** デプロイステータス */
export type DeployStatus = "draft" | "canary" | "active" | "archived";

/** エージェントバージョン */
export interface AgentVersion {
  id: string;
  agent_id: string;
  version: number;
  system_prompt: string;
  model: ModelName;
  temperature: number;
  max_tokens: number;
  change_description: string | null;
  deploy_status: DeployStatus;
  canary_percent: number;
  created_by: string;
  created_at: string;
}

// ============================================================
// エージェント間通信 (パイプライン)
// ============================================================

/** パイプラインステップ定義 */
export interface PipelineStep {
  agent_id: string;
  role?: string;
  input_template: string;
}

/** パイプラインステップ実行結果 */
export interface PipelineStepResult {
  agent_id: string;
  agent_name: string;
  role: string;
  input: string;
  output: string;
  cost_usd: number;
  latency_ms: number;
}

/** パイプライン定義 */
export interface AgentPipeline {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** パイプライン実行レコード */
export interface PipelineRun {
  id: string;
  pipeline_id: string;
  workspace_id: string;
  user_id: string;
  status: "running" | "success" | "error";
  input: string;
  output: string | null;
  step_results: PipelineStepResult[];
  total_cost_usd: number;
  total_latency_ms: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// ============================================================
// MCP設定エクスポート
// ============================================================

/** claude_code_settings.json 用のMCPサーバー設定 */
export interface McpServerConfig {
  command: string;
  args: string[];
  env: {
    AGENT_BUILDER_URL: string;
    AGENT_BUILDER_KEY: string;
    ANTHROPIC_API_KEY: string;
  };
}

/** MCP設定ファイル全体 */
export interface McpSettings {
  mcpServers: {
    "agent-builder": McpServerConfig;
  };
}
