/**
 * APIキー暗号化ユーティリティ
 *
 * AES-256-GCM でAPIキーを暗号化/復号する。
 * 暗号化キーは環境変数 API_KEY_ENCRYPTION_SECRET から取得。
 */
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * 環境変数から暗号化キーを取得し、32バイトに正規化
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET が未設定です。openssl rand -hex 32 で生成してください。"
    );
  }
  // SHA-256 で32バイトに正規化（キー長が不定でも安全に扱える）
  return crypto.createHash("sha256").update(secret).digest();
}

export interface EncryptedData {
  /** 暗号文（hex） */
  encrypted: string;
  /** 初期化ベクトル（hex） */
  iv: string;
  /** GCM認証タグ（hex） */
  authTag: string;
}

/**
 * 平文のAPIキーを暗号化する
 */
export function encryptApiKey(plainKey: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

/**
 * 暗号化されたAPIキーを復号する
 */
export function decryptApiKey(data: EncryptedData): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(data.iv, "hex");
  const authTag = Buffer.from(data.authTag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(data.encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * APIキーからマスク表示用ヒントを生成
 * 例: "sk-proj-abc...xyz" → "sk-p****xyz"
 */
export function generateKeyHint(plainKey: string): string {
  if (plainKey.length <= 8) return "****";
  const prefix = plainKey.slice(0, 4);
  const suffix = plainKey.slice(-4);
  return `${prefix}****${suffix}`;
}
