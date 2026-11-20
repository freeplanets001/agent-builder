/**
 * 評価スコアラー
 *
 * テストケースの期待出力と実際の出力を比較してスコアリングする。
 */

/** スコアリング結果 */
export interface ScoreResult {
  score: number; // 0.0 - 1.0
  passed: boolean;
  reason: string;
}

/** 評価基準の型 */
export interface EvalCriteria {
  type: "exact" | "contains" | "keywords" | "ai_judge" | "regex";
  /** contains/keywords: チェックする文字列 */
  keywords?: string[];
  /** regex: 正規表現パターン */
  pattern?: string;
  /** 合格閾値（デフォルト: 0.7） */
  threshold?: number;
}

/**
 * 完全一致スコアラー
 */
export function scoreExact(actual: string, expected: string): ScoreResult {
  const normalizedActual = actual.trim().toLowerCase();
  const normalizedExpected = expected.trim().toLowerCase();
  const passed = normalizedActual === normalizedExpected;
  return {
    score: passed ? 1.0 : 0.0,
    passed,
    reason: passed ? "完全一致" : "不一致",
  };
}

/**
 * 部分一致（contains）スコアラー
 */
export function scoreContains(actual: string, expected: string): ScoreResult {
  const lower = actual.toLowerCase();
  const passed = lower.includes(expected.toLowerCase());
  return {
    score: passed ? 1.0 : 0.0,
    passed,
    reason: passed ? `"${expected.slice(0, 50)}" を含む` : `"${expected.slice(0, 50)}" を含まない`,
  };
}

/**
 * キーワードスコアラー — 複数キーワードの含有率
 */
export function scoreKeywords(actual: string, keywords: string[]): ScoreResult {
  if (keywords.length === 0) return { score: 1.0, passed: true, reason: "キーワードなし" };

  const lower = actual.toLowerCase();
  const found = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  const score = found.length / keywords.length;
  const passed = score >= 0.7;

  return {
    score,
    passed,
    reason: `${found.length}/${keywords.length} キーワードを含む (${Math.round(score * 100)}%)`,
  };
}

/**
 * 正規表現スコアラー
 */
export function scoreRegex(actual: string, pattern: string): ScoreResult {
  try {
    const regex = new RegExp(pattern, "i");
    const passed = regex.test(actual);
    return {
      score: passed ? 1.0 : 0.0,
      passed,
      reason: passed ? `パターン /${pattern}/ にマッチ` : `パターン /${pattern}/ にマッチしない`,
    };
  } catch {
    return { score: 0, passed: false, reason: `無効な正規表現: ${pattern}` };
  }
}

/**
 * AI判定スコアラー — Haikuで期待出力との意味的一致を判定
 */
export async function scoreWithAI(
  actual: string,
  expected: string,
  input: string,
  workspaceId: string
): Promise<ScoreResult> {
  try {
    const { getAIProvider } = await import("@/lib/ai-client");
    const provider = await getAIProvider("claude-haiku-4-5", workspaceId);

    const result = await provider.chat({
      model: "claude-haiku-4-5",
      maxTokens: 200,
      temperature: 0,
      systemPrompt: `あなたはAI出力の品質評価者です。
ユーザーの入力と期待される出力を参考に、実際の出力の品質を0-100のスコアで評価してください。

評価基準:
- 内容の正確性
- 期待される情報の網羅度
- 不要な情報の有無

回答形式（JSON一行のみ）:
{"score": 85, "reason": "理由"}`,
      messages: [{
        role: "user",
        content: `入力: ${input.slice(0, 500)}\n\n期待される出力: ${expected.slice(0, 500)}\n\n実際の出力: ${actual.slice(0, 500)}`,
      }],
    });

    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { score: number; reason: string };
      const normalizedScore = Math.min(1, Math.max(0, parsed.score / 100));
      return {
        score: normalizedScore,
        passed: normalizedScore >= 0.7,
        reason: parsed.reason,
      };
    }
  } catch {
    // AI判定失敗時はフォールバック
  }

  return { score: 0.5, passed: false, reason: "AI判定に失敗（フォールバック）" };
}

/**
 * 評価基準に基づいてスコアリングを実行
 */
export async function evaluateOutput(
  actual: string,
  expected: string | null,
  input: string,
  criteria: EvalCriteria,
  workspaceId: string
): Promise<ScoreResult> {
  switch (criteria.type) {
    case "exact":
      return expected ? scoreExact(actual, expected) : { score: 0, passed: false, reason: "期待出力が未設定" };

    case "contains":
      return expected ? scoreContains(actual, expected) : { score: 0, passed: false, reason: "期待出力が未設定" };

    case "keywords":
      return scoreKeywords(actual, criteria.keywords ?? []);

    case "regex":
      return criteria.pattern ? scoreRegex(actual, criteria.pattern) : { score: 0, passed: false, reason: "正規表現パターンが未設定" };

    case "ai_judge":
      return scoreWithAI(actual, expected ?? "", input, workspaceId);

    default:
      // デフォルト: 期待出力がある場合はキーワード、なければAI判定
      if (expected) {
        return scoreContains(actual, expected);
      }
      return { score: 1.0, passed: true, reason: "評価基準なし（自動パス）" };
  }
}
