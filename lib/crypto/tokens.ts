import crypto from "node:crypto";

/**
 * 채널 액세스 토큰 암호화 — 서버 전용 (AES-256-GCM, 앱단 암호화).
 *
 * connected_accounts의 토큰은 평문으로 저장하지 않는다. RLS로 행 접근을 막아도,
 * DB 유출·백업 노출 시 평문 토큰이 그대로 새는 것을 막기 위한 이중 방어다.
 *
 * 키: TOKEN_ENCRYPTION_KEY (서버 전용, NEXT_PUBLIC_ 금지). 32바이트를 base64 또는 hex로.
 *   생성 예: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 * 키가 없으면 암·복호화 함수는 null을 반환하고, 호출측은 연동을 진행하지 않는다.
 *
 * 저장 포맷(문자열): v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 */

const FORMAT_VERSION = "v1";

/** 32바이트 키 로드 — base64/hex 자동 판별. 형식이 틀리면 null. */
function loadKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  let key: Buffer;
  try {
    key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  return key.length === 32 ? key : null;
}

/** 토큰 암호화 — 키 미설정 시 null (연동 불가) */
export function encryptToken(plaintext: string): string | null {
  const key = loadKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12); // GCM 표준 96-bit nonce
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FORMAT_VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/** 토큰 복호화 — 키 미설정·포맷 오류·변조 시 null */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const key = loadKey();
  if (!key) return null;
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const enc = Buffer.from(parts[3], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    // 변조되었거나 다른 키로 암호화된 값 — 복호화 실패
    return null;
  }
}

/** 암호화 키 설정 여부 (연동 가능 여부 판단용) */
export function isTokenEncryptionConfigured(): boolean {
  return loadKey() !== null;
}
