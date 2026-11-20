/**
 * Supabase データベース型定義
 * 本番環境では `npx supabase gen types typescript` で自動生成する
 * ここでは supabase/schema.sql 実装前の仮定義として使用する
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          github_username: string | null;
          plan: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          github_username?: string | null;
          plan?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          github_username?: string | null;
          plan?: string;
          updated_at?: string;
        };
      };
      workspaces: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          avatar_url: string | null;
          plan: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug: string;
          avatar_url?: string | null;
          plan?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          avatar_url?: string | null;
          plan?: string;
          updated_at?: string;
        };
      };
      agents: {
        Row: {
          id: string;
          workspace_id: string;
          created_by: string;
          name: string;
          description: string | null;
          system_prompt: string;
          model: string;
          temperature: number;
          max_tokens: number;
          visibility: string;
          is_active: boolean;
          version: number;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          created_by: string;
          name: string;
          description?: string | null;
          system_prompt: string;
          model: string;
          temperature?: number;
          max_tokens?: number;
          visibility?: string;
          is_active?: boolean;
          version?: number;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          system_prompt?: string;
          model?: string;
          temperature?: number;
          max_tokens?: number;
          visibility?: string;
          is_active?: boolean;
          tags?: string[];
          updated_at?: string;
        };
      };
      agent_tools: {
        Row: {
          id: string;
          agent_id: string;
          tool_type: string;
          tool_name: string;
          description: string;
          config: Json;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          tool_type: string;
          tool_name: string;
          description: string;
          config?: Json;
          enabled?: boolean;
          created_at?: string;
        };
        Update: {
          tool_name?: string;
          description?: string;
          config?: Json;
          enabled?: boolean;
        };
      };
      agent_variables: {
        Row: {
          id: string;
          agent_id: string;
          key: string;
          label: string;
          description: string | null;
          default_value: string | null;
          required: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          key: string;
          label: string;
          description?: string | null;
          default_value?: string | null;
          required?: boolean;
          created_at?: string;
        };
        Update: {
          label?: string;
          description?: string | null;
          default_value?: string | null;
          required?: boolean;
        };
      };
      agent_versions: {
        Row: {
          id: string;
          agent_id: string;
          version: number;
          system_prompt: string;
          model: string;
          temperature: number;
          max_tokens: number;
          change_note: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          version: number;
          system_prompt: string;
          model: string;
          temperature: number;
          max_tokens: number;
          change_note?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      flows: {
        Row: {
          id: string;
          workspace_id: string;
          created_by: string;
          name: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          created_by: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      flow_nodes: {
        Row: {
          id: string;
          flow_id: string;
          type: string;
          position: Json;
          agent_id: string | null;
          condition: string | null;
          data: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          flow_id: string;
          type: string;
          position: Json;
          agent_id?: string | null;
          condition?: string | null;
          data?: Json;
          created_at?: string;
        };
        Update: {
          type?: string;
          position?: Json;
          agent_id?: string | null;
          condition?: string | null;
          data?: Json;
        };
      };
      flow_edges: {
        Row: {
          id: string;
          flow_id: string;
          source_node_id: string;
          target_node_id: string;
          type: string;
          label: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          flow_id: string;
          source_node_id: string;
          target_node_id: string;
          type?: string;
          label?: string | null;
          created_at?: string;
        };
        Update: {
          type?: string;
          label?: string | null;
        };
      };
      execution_logs: {
        Row: {
          id: string;
          agent_id: string;
          conversation_id: string | null;
          workspace_id: string;
          user_id: string;
          status: string;
          input: string;
          output: string | null;
          variables_used: Json | null;
          model: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd: number;
          latency_ms: number;
          feedback: string | null;
          error_message: string | null;
          started_at: string;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          conversation_id?: string | null;
          workspace_id: string;
          user_id: string;
          status: string;
          input: string;
          output?: string | null;
          variables_used?: Json | null;
          model: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number;
          latency_ms?: number;
          feedback?: string | null;
          error_message?: string | null;
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: string;
          output?: string | null;
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number;
          latency_ms?: number;
          feedback?: string | null;
          error_message?: string | null;
          ended_at?: string | null;
        };
      };
      conversations: {
        Row: {
          id: string;
          agent_id: string;
          user_id: string;
          title: string | null;
          last_message_preview: string | null;
          message_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          user_id: string;
          title?: string | null;
          last_message_preview?: string | null;
          message_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string | null;
          last_message_preview?: string | null;
          message_count?: number;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: string;
          content: string;
          tool_uses: Json | null;
          input_tokens: number | null;
          output_tokens: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: string;
          content: string;
          tool_uses?: Json | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      api_keys: {
        Row: {
          id: string;
          workspace_id: string;
          created_by: string;
          name: string;
          key_prefix: string;
          key_hash: string;
          last_used_at: string | null;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          created_by: string;
          name: string;
          key_prefix: string;
          key_hash: string;
          last_used_at?: string | null;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          last_used_at?: string | null;
          is_active?: boolean;
        };
      };
      usage_stats: {
        Row: {
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
        };
        Insert: {
          id?: string;
          workspace_id: string;
          agent_id?: string | null;
          period_start: string;
          period_end: string;
          total_requests?: number;
          successful_requests?: number;
          failed_requests?: number;
          total_input_tokens?: number;
          total_output_tokens?: number;
          total_cost_usd?: number;
          created_at?: string;
        };
        Update: {
          total_requests?: number;
          successful_requests?: number;
          failed_requests?: number;
          total_input_tokens?: number;
          total_output_tokens?: number;
          total_cost_usd?: number;
        };
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: string;
          invited_by: string | null;
          joined_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: string;
          invited_by?: string | null;
          joined_at?: string;
          created_at?: string;
        };
        Update: {
          role?: string;
        };
      };
      marketplace_listings: {
        Row: {
          id: string;
          agent_id: string;
          workspace_id: string;
          published_by: string;
          title: string;
          description: string;
          tags: string[];
          fork_count: number;
          like_count: number;
          review_count: number;
          average_rating: number;
          published_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          workspace_id: string;
          published_by: string;
          title: string;
          description: string;
          tags?: string[];
          fork_count?: number;
          like_count?: number;
          review_count?: number;
          average_rating?: number;
          published_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string;
          tags?: string[];
          like_count?: number;
          review_count?: number;
          average_rating?: number;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
