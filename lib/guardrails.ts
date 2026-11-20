/**
 * Guardrails — 入力/出力の安全性チェック
 *
 * 入力: プロンプトインジェクション検出 + ブロックパターン
 * 出力: PII検出・マスキング + ブロックパターン
 */

/** ガードレール設定 */
export interface AgentGuardrails {
  id: string;
  agent_id: string;
  input_injection_check: boolean;
  input_blocked_patterns: string[];
  output_pii_check: boolean;
  output_pii_mask: boolean;
  output_blocked_patterns: string[];
  mode: "block" | "warn" | "log";
}

/** 違反の種類 */
export type ViolationType = "injection" | "pii" | "blocked_pattern";

/** 個別の違反情報 */
export interface Violation {
  type: ViolationType;
  detail: string;
  severity: "low" | "medium" | "high";
}

/** ガードレールチェック結果 */
export interface GuardResult {
  passed: boolean;
  violations: Violation[];
  /** PIIマスキング後のコンテンツ（出力チェック時のみ） */
  sanitizedContent?: string;
}

// ============================================================
// プロンプトインジェクション検出パターン
// ============================================================

const INJECTION_PATTERNS: Array<{ pattern: RegExp; severity: "low" | "medium" | "high"; detail: string }> = [
  // 直接的な指示上書き
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, severity: "high", detail: "「前の指示を無視」パターン" },
  { pattern: /ignore\s+(all\s+)?above\s+instructions/i, severity: "high", detail: "「上の指示を無視」パターン" },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above)/i, severity: "high", detail: "「以前の指示を無視」パターン" },
  { pattern: /forget\s+(all\s+)?(previous|prior|your)\s+(instructions|rules|guidelines)/i, severity: "high", detail: "「指示を忘れて」パターン" },
  { pattern: /override\s+(your|the|all)\s+(instructions|rules|system)/i, severity: "high", detail: "「指示を上書き」パターン" },
  { pattern: /前の指示を(無視|忘れ|取り消)/i, severity: "high", detail: "「前の指示を無視」(日本語)" },
  { pattern: /システムプロンプトを(無視|変更|上書き)/i, severity: "high", detail: "「システムプロンプトを操作」(日本語)" },
  { pattern: /指示を(全て|すべて)?(無視|忘れ|リセット)/i, severity: "high", detail: "「指示を無視」(日本語)" },

  // システムロール偽装
  { pattern: /\[system\]/i, severity: "high", detail: "[system]タグ偽装" },
  { pattern: /\[INST\]/i, severity: "high", detail: "[INST]タグ偽装" },
  { pattern: /<\|im_start\|>/i, severity: "high", detail: "ChatML形式の偽装" },
  { pattern: /<\|system\|>/i, severity: "high", detail: "システムタグ偽装" },
  { pattern: /^system:/im, severity: "medium", detail: "system:プレフィックス偽装" },
  { pattern: /Human:|Assistant:/i, severity: "medium", detail: "ロール名偽装" },

  // プロンプトリーク試行
  { pattern: /show\s+(me\s+)?(your|the)\s+(system\s+)?prompt/i, severity: "medium", detail: "システムプロンプト取得試行" },
  { pattern: /reveal\s+(your|the)\s+(system\s+)?instructions/i, severity: "medium", detail: "指示取得試行" },
  { pattern: /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions)/i, severity: "medium", detail: "プロンプト質問" },
  { pattern: /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions)/i, severity: "medium", detail: "プロンプト繰り返し要求" },
  { pattern: /システムプロンプトを(教えて|見せて|表示)/i, severity: "medium", detail: "プロンプト取得(日本語)" },
  { pattern: /あなたの指示を(教えて|見せて|表示)/i, severity: "medium", detail: "指示取得(日本語)" },

  // ロール変更
  { pattern: /you\s+are\s+now\s+(a|an)\s/i, severity: "high", detail: "ロール変更指示" },
  { pattern: /pretend\s+(you\s+are|to\s+be)/i, severity: "medium", detail: "ロール偽装指示" },
  { pattern: /act\s+as\s+(a|an|if)/i, severity: "low", detail: "ロール変更示唆" },
  { pattern: /あなたは今から/i, severity: "medium", detail: "ロール変更(日本語)" },
  { pattern: /になりきって/i, severity: "low", detail: "ロール偽装(日本語)" },

  // エンコーディングバイパス
  { pattern: /base64\s*:/i, severity: "medium", detail: "Base64エンコーディング試行" },
  { pattern: /\\u[0-9a-f]{4}/i, severity: "low", detail: "Unicodeエスケープ試行" },
  { pattern: /&#x?[0-9a-f]+;/i, severity: "low", detail: "HTMLエンティティ試行" },

  // DAN / Jailbreak
  { pattern: /\bDAN\b/i, severity: "high", detail: "DAN (Do Anything Now) ジェイルブレイク" },
  { pattern: /\bjailbreak\b/i, severity: "high", detail: "ジェイルブレイク明示" },
  { pattern: /developer\s+mode/i, severity: "high", detail: "開発者モード偽装" },
];

// ============================================================
// PII検出パターン（日本語 + 英語）
// ============================================================

const PII_PATTERNS: Record<string, { pattern: RegExp; label: string }> = {
  email: {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    label: "メールアドレス",
  },
  phone_jp: {
    pattern: /(?:0[0-9]{1,4}-?[0-9]{1,4}-?[0-9]{3,4})|(?:\+81-?[0-9]{1,4}-?[0-9]{1,4}-?[0-9]{3,4})/g,
    label: "電話番号(日本)",
  },
  phone_intl: {
    pattern: /\+[1-9][0-9]{7,14}/g,
    label: "電話番号(国際)",
  },
  credit_card: {
    pattern: /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{1}|6(?:011|5[0-9]{2}))[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b/g,
    label: "クレジットカード番号",
  },
  my_number: {
    pattern: /\b[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\b/g,
    label: "マイナンバー(候補)",
  },
  ip_address: {
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    label: "IPアドレス",
  },
};

// ============================================================
// 入力チェック
// ============================================================

/**
 * 入力テキストに対してガードレールチェックを実行する
 */
export function checkInputGuardrails(
  input: string,
  config: AgentGuardrails
): GuardResult {
  const violations: Violation[] = [];

  // インジェクション検出
  if (config.input_injection_check) {
    for (const { pattern, severity, detail } of INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        violations.push({ type: "injection", detail, severity });
      }
      // RegExpのlastIndexをリセット（globalフラグなしでも念のため）
      pattern.lastIndex = 0;
    }
  }

  // ブロックパターン
  for (const blocked of config.input_blocked_patterns) {
    if (blocked && input.toLowerCase().includes(blocked.toLowerCase())) {
      violations.push({
        type: "blocked_pattern",
        detail: `ブロックパターン検出: "${blocked}"`,
        severity: "medium",
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

// ============================================================
// 出力チェック
// ============================================================

/**
 * 出力テキストに対してガードレールチェックを実行する
 */
export function checkOutputGuardrails(
  output: string,
  config: AgentGuardrails
): GuardResult {
  const violations: Violation[] = [];
  let sanitized = output;

  // PII検出 + マスキング
  if (config.output_pii_check) {
    for (const [, { pattern, label }] of Object.entries(PII_PATTERNS)) {
      // パターンのグローバルフラグをリセット
      pattern.lastIndex = 0;
      const matches = output.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push({
            type: "pii",
            detail: `${label}を検出: ${match.slice(0, 3)}***`,
            severity: "high",
          });
          if (config.output_pii_mask) {
            sanitized = sanitized.replace(match, `[${label}]`);
          }
        }
      }
    }
  }

  // ブロックパターン
  for (const blocked of config.output_blocked_patterns) {
    if (blocked && output.toLowerCase().includes(blocked.toLowerCase())) {
      violations.push({
        type: "blocked_pattern",
        detail: `ブロックパターン検出: "${blocked}"`,
        severity: "medium",
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    sanitizedContent: sanitized !== output ? sanitized : undefined,
  };
}
