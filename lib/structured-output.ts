/**
 * Structured Output — JSON Schema バリデーション + リトライ
 *
 * エージェントの出力をJSON Schemaで検証し、
 * 不適合の場合はリトライプロンプトを生成する。
 */

/** バリデーション結果 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  parsedJson?: unknown;
}

/**
 * テキストからJSONを抽出する
 * Markdownコードブロック内のJSON、または生のJSONを検出
 */
export function extractJsonFromText(text: string): string | null {
  // 1. ```json ... ``` ブロック
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (jsonBlockMatch) {
    const content = jsonBlockMatch[1].trim();
    try {
      JSON.parse(content);
      return content;
    } catch { /* 続行 */ }
  }

  // 2. { で始まり } で終わる最大のブロック
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    const candidate = text.slice(braceStart, braceEnd + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch { /* 続行 */ }
  }

  // 3. [ で始まり ] で終わる配列
  const bracketStart = text.indexOf("[");
  const bracketEnd = text.lastIndexOf("]");
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    const candidate = text.slice(bracketStart, bracketEnd + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch { /* 続行 */ }
  }

  return null;
}

/**
 * JSON Schemaの簡易バリデーター
 * サポート: type, required, properties, items, enum, minLength, maxLength, minimum, maximum
 */
export function validateAgentOutput(
  output: string,
  schema: Record<string, unknown>
): ValidationResult {
  const jsonStr = extractJsonFromText(output);
  if (!jsonStr) {
    return { valid: false, errors: ["出力からJSONを抽出できませんでした"] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return { valid: false, errors: [`JSONパースエラー: ${e instanceof Error ? e.message : "不明"}`] };
  }

  const errors: string[] = [];
  validateValue(parsed, schema, "root", errors);

  return { valid: errors.length === 0, errors, parsedJson: parsed };
}

/** 再帰的にスキーマを検証する */
function validateValue(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: string[]
): void {
  // type チェック
  if (schema.type) {
    const expectedType = schema.type as string;
    if (!checkType(value, expectedType)) {
      errors.push(`${path}: 期待される型は "${expectedType}" ですが "${typeof value}" です`);
      return;
    }
  }

  // enum チェック
  if (schema.enum && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value)) {
      errors.push(`${path}: 値は ${JSON.stringify(schema.enum)} のいずれかである必要があります`);
    }
  }

  // string 制約
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: 最小文字数 ${schema.minLength} を満たしていません (現在: ${value.length})`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path}: 最大文字数 ${schema.maxLength} を超えています (現在: ${value.length})`);
    }
  }

  // number 制約
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < (schema.minimum as number)) {
      errors.push(`${path}: 最小値 ${schema.minimum} を下回っています (現在: ${value})`);
    }
    if (typeof schema.maximum === "number" && value > (schema.maximum as number)) {
      errors.push(`${path}: 最大値 ${schema.maximum} を超えています (現在: ${value})`);
    }
  }

  // object: properties + required
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    if (schema.required && Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in obj)) {
          errors.push(`${path}: 必須プロパティ "${key}" がありません`);
        }
      }
    }

    if (schema.properties && typeof schema.properties === "object") {
      const props = schema.properties as Record<string, Record<string, unknown>>;
      for (const [key, propSchema] of Object.entries(props)) {
        if (key in obj) {
          validateValue(obj[key], propSchema, `${path}.${key}`, errors);
        }
      }
    }
  }

  // array: items
  if (Array.isArray(value) && schema.items && typeof schema.items === "object") {
    const itemSchema = schema.items as Record<string, unknown>;
    for (let i = 0; i < value.length; i++) {
      validateValue(value[i], itemSchema, `${path}[${i}]`, errors);
    }
    if (typeof schema.minItems === "number" && value.length < (schema.minItems as number)) {
      errors.push(`${path}: 最小要素数 ${schema.minItems} を満たしていません (現在: ${value.length})`);
    }
    if (typeof schema.maxItems === "number" && value.length > (schema.maxItems as number)) {
      errors.push(`${path}: 最大要素数 ${schema.maxItems} を超えています (現在: ${value.length})`);
    }
  }
}

/** JavaScript typeof とJSON Schema type の対応 */
function checkType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case "string": return typeof value === "string";
    case "number": case "integer": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "null": return value === null;
    default: return true;
  }
}

/**
 * バリデーション失敗時のリトライプロンプトを生成する
 */
export function buildRetryPrompt(
  originalOutput: string,
  errors: string[],
  schema: Record<string, unknown>
): string {
  return `あなたの前回の出力はJSON Schemaのバリデーションに失敗しました。

【エラー内容】
${errors.map((e) => `- ${e}`).join("\n")}

【期待されるスキーマ】
${JSON.stringify(schema, null, 2)}

【あなたの前回の出力】
${originalOutput.slice(0, 2000)}

上記のエラーを修正し、スキーマに準拠したJSONのみを出力してください。
JSONはMarkdownコードブロック \`\`\`json ... \`\`\` で囲んでください。`;
}
