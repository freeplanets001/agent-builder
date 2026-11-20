/**
 * ワークスペース単位のレート制限
 *
 * インメモリのスライディングウィンドウ方式。
 * サーバー再起動でリセットされるが、低コストで高速。
 */

/** レート制限設定 */
interface RateLimitConfig {
  /** ウィンドウ期間（ミリ秒） */
  windowMs: number;
  /** ウィンドウ内の最大リクエスト数 */
  maxRequests: number;
}

/** デフォルト設定: 1分あたり30リクエスト */
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 30,
};

/** エンドポイント別の制限設定 */
const ENDPOINT_CONFIGS: Record<string, RateLimitConfig> = {
  "/api/orchestrator": { windowMs: 60_000, maxRequests: 20 },
  "/api/agents/run": { windowMs: 60_000, maxRequests: 30 },
  "/api/image/generate": { windowMs: 60_000, maxRequests: 10 },
  "/api/image/batch": { windowMs: 60_000, maxRequests: 5 },
  "/api/image/edit": { windowMs: 60_000, maxRequests: 10 },
};

/** リクエストタイムスタンプのストア */
const requestStore = new Map<string, number[]>();

/** ストアの定期クリーンアップ間隔（5分） */
const CLEANUP_INTERVAL_MS = 300_000;
let lastCleanup = Date.now();

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, timestamps] of requestStore.entries()) {
    const filtered = timestamps.filter((t) => now - t < 300_000);
    if (filtered.length === 0) {
      requestStore.delete(key);
    } else {
      requestStore.set(key, filtered);
    }
  }
}

export interface RateLimitResult {
  /** リクエストが許可されたか */
  allowed: boolean;
  /** 残りリクエスト数 */
  remaining: number;
  /** ウィンドウ期間内の上限 */
  limit: number;
  /** リセットまでの秒数 */
  resetInSeconds: number;
}

/**
 * レート制限をチェックする
 *
 * @param workspaceId ワークスペースID
 * @param endpoint エンドポイントパス（オプション）
 * @returns チェック結果。allowed=false なら429を返すべき
 */
export function checkRateLimit(
  workspaceId: string,
  endpoint?: string
): RateLimitResult {
  cleanup();

  const config: RateLimitConfig = (endpoint ? ENDPOINT_CONFIGS[endpoint] : undefined) ?? DEFAULT_CONFIG;
  const key = `${workspaceId}:${endpoint ?? "global"}`;
  const now = Date.now();

  // 既存のタイムスタンプを取得し、期限切れのものを除外
  const timestamps = (requestStore.get(key) ?? []).filter(
    (t) => now - t < config.windowMs
  );

  const allowed = timestamps.length < config.maxRequests;

  if (allowed) {
    timestamps.push(now);
  }

  requestStore.set(key, timestamps);

  const oldestInWindow = timestamps[0] ?? now;
  const resetInMs = Math.max(0, config.windowMs - (now - oldestInWindow));

  return {
    allowed,
    remaining: Math.max(0, config.maxRequests - timestamps.length),
    limit: config.maxRequests,
    resetInSeconds: Math.ceil(resetInMs / 1000),
  };
}

/**
 * レート制限レスポンスヘッダーを生成
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetInSeconds),
  };
}
