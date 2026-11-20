-- Debug Trace: 実行ログにデバッグトレースカラムを追加
ALTER TABLE public.execution_logs ADD COLUMN IF NOT EXISTS debug_trace JSONB DEFAULT NULL;

COMMENT ON COLUMN public.execution_logs.debug_trace IS 'デバッグトレース: [{timestamp, event, data}]';
