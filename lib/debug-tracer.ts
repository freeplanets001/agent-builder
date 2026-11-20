/**
 * Debug Tracer — エージェント実行のステップバイステップ記録
 *
 * 各イベント（プロンプト構築、AI呼び出し、ツール実行等）を
 * タイムスタンプ付きで収集し、execution_logsに保存する。
 */

/** トレースイベントの種類 */
export type TraceEventType =
  | "prompt_build"   // プロンプト構築
  | "rag_search"     // RAG検索
  | "memory_search"  // メモリ検索
  | "guardrail_input"  // 入力ガードレール
  | "guardrail_output" // 出力ガードレール
  | "cost_check"     // コストチェック
  | "ai_call_start"  // AI呼び出し開始
  | "ai_call_end"    // AI呼び出し完了
  | "tool_call"      // ツール呼び出し
  | "tool_result"    // ツール結果
  | "schema_validate" // スキーマバリデーション
  | "schema_retry"   // スキーマリトライ
  | "memory_extract" // メモリ自動抽出
  | "image_generate" // 画像生成
  | "error";         // エラー

/** トレースイベント */
export interface TraceEvent {
  timestamp: string;
  event: TraceEventType;
  duration_ms?: number;
  data: Record<string, unknown>;
}

/**
 * デバッグトレーサー
 * 実行中にイベントを収集し、最後にまとめてDBに保存する。
 */
export class DebugTracer {
  private events: TraceEvent[] = [];
  private startTime: number;
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    this.startTime = Date.now();
  }

  /** イベントを記録 */
  trace(event: TraceEventType, data: Record<string, unknown> = {}): void {
    if (!this.enabled) return;

    this.events.push({
      timestamp: new Date().toISOString(),
      event,
      duration_ms: Date.now() - this.startTime,
      data,
    });
  }

  /** 時間計測付きイベント記録 */
  async traceAsync<T>(
    event: TraceEventType,
    fn: () => Promise<T>,
    data: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.enabled) return fn();

    const eventStart = Date.now();
    this.trace(event, { ...data, status: "start" });

    try {
      const result = await fn();
      this.events.push({
        timestamp: new Date().toISOString(),
        event,
        duration_ms: Date.now() - eventStart,
        data: { ...data, status: "complete" },
      });
      return result;
    } catch (err) {
      this.events.push({
        timestamp: new Date().toISOString(),
        event: "error",
        duration_ms: Date.now() - eventStart,
        data: { ...data, error: err instanceof Error ? err.message : "不明" },
      });
      throw err;
    }
  }

  /** 収集したイベントを取得 */
  getEvents(): TraceEvent[] {
    return this.events;
  }

  /** JSONシリアライズ可能な形式で返す */
  toJSON(): TraceEvent[] {
    return this.events;
  }

  /** 合計実行時間 */
  getTotalDuration(): number {
    return Date.now() - this.startTime;
  }
}
