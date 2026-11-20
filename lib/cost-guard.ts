/**
 * コスト上限チェック
 *
 * API呼び出し前に月間累計コストを確認し、上限超過ならブロックする。
 */
import { createServiceRoleClient } from "@/lib/supabase-server";

export interface CostCheckResult {
  /** リクエストが許可されたか */
  allowed: boolean;
  /** 今月の累計コスト (USD) */
  currentUsd: number;
  /** 月間上限 (USD) */
  limitUsd: number;
  /** 使用率 (%) */
  percentUsed: number;
  /** 警告閾値を超えたか */
  isWarning: boolean;
  /** ハードリミットか */
  isHardLimit: boolean;
}

/**
 * ワークスペースのコスト上限をチェックする
 */
export async function checkCostLimit(workspaceId: string): Promise<CostCheckResult> {
  const supabase = createServiceRoleClient();

  // コスト上限設定を取得
  const { data: limits } = await supabase
    .from("workspace_cost_limits")
    .select("monthly_limit_usd, alert_threshold_percent, is_hard_limit")
    .eq("workspace_id", workspaceId)
    .single();

  // 設定がなければ無制限
  if (!limits) {
    return {
      allowed: true,
      currentUsd: 0,
      limitUsd: 0,
      percentUsed: 0,
      isWarning: false,
      isHardLimit: false,
    };
  }

  // 今月の累計コストを算出
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: costData } = await supabase
    .from("execution_logs")
    .select("cost_usd")
    .eq("workspace_id", workspaceId)
    .gte("created_at", monthStart);

  const currentUsd = (costData ?? []).reduce(
    (sum, row) => sum + (Number(row.cost_usd) || 0),
    0
  );

  const limitUsd = Number(limits.monthly_limit_usd) || 0;
  const percentUsed = limitUsd > 0 ? (currentUsd / limitUsd) * 100 : 0;
  const alertThreshold = limits.alert_threshold_percent ?? 80;
  const isWarning = percentUsed >= alertThreshold;
  const isHardLimit = limits.is_hard_limit ?? false;
  const allowed = !isHardLimit || percentUsed < 100;

  return {
    allowed,
    currentUsd,
    limitUsd,
    percentUsed,
    isWarning,
    isHardLimit,
  };
}
