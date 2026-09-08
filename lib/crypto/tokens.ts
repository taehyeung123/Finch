/* 시크릿(TOKEN_ENCRYPTION_KEY)을 읽는 모듈이다 — 이 한 줄이 있으면 클라이언트 그래프에 닿는 순간 **빌드가 실패한다.**
   경계를 사람의 주의력이 아니라 빌드가 지키게 한다(2026-09-07 감사: 같은 저장소의 다른 6개 모듈에는 이미 있었다). */
import "server-only";
import crypto from "node:crypto";
import { consoleErrorThrottled } from "@/lib/monitoring/log-throttle";

/**
 * 채널 액세스 토큰·빌링키 암호화 — 서버 전용 (AES-256-GCM, 앱단 암호화).
 *
 * 평문으로 저장하지 않는다. RLS로 행 접근을 막아도, DB 유출·백업 노출 시 평문이 그대로 새는 것을
 * 막기 위한 이중 방어다.
 *
 * 키: TOKEN_ENCRYPTION_KEY (서버 전용, NEXT_PUBLIC_ 금지). 32바이트를 base64 또는 hex로.
 *   생성 예: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 * 키가 없으면 암·복호화 함수는 null을 반환하고, 호출측은 연동을 진행하지 않는다.
 *
 * ── v2 로 올린 이유 (2026-09-08 보안 감사) ────────────────────────────────────
 * v1 암호문에는 **«누구의 것인지»가 담겨 있지 않았다.** 그래서 남의 암호문을 손에 넣어
 * 자기 연동 행에 붙여 넣으면 서버가 그것을 자기 토큰으로 알고 그대로 써 줬다 —
 * 사실상 **무기명 토큰**이었다. 팀에서 빠진 뒤에도 소유자의 광고 계정에 캠페인을 만들고 켤 수 있었고
 * (소유자 카드로 실제 돈이 나간다), 우리 쪽에서 무효화할 방법이 없었다.
 *
 * v2 는 AES-GCM 의 **AAD(추가 인증 데이터)** 에 `<user_id>|<표.컬럼>` 을 못박는다.
 * 다른 행에 붙여 넣으면 AAD 가 달라 인증 태그 검증이 실패하고 null 이 된다.
 * AAD 는 암호문에 저장되지 않는다 — 복호화하는 쪽이 «이 행은 누구 것인가»를 알고 넣어야 한다.
 * 그래서 **행을 옮기는 것만으로는 절대 통과할 수 없다.**
 *
 * ── 이관 방식: 재봉인 마이그레이션이 없다 ─────────────────────────────────────
 * v1 을 **읽기만** 계속 받아 준다. 새로 쓰는 값은 전부 v2 다.
 * 토큰은 원래 주기적으로 다시 쓰인다(갱신 크론·재연동) — 그래서 v1 은 시간이 지나면 저절로 사라진다.
 * 저장된 토큰을 한꺼번에 다시 봉인하는 작업을 **일부러 하지 않았다**: 그 작업이 중간에 잘못되면
 * 전 사용자 연동이 한꺼번에 죽는데, 얻는 것은 «드레인이 몇 주 빨라지는 것»뿐이다.
 * 실질 방어는 이미 마이그레이션 0085 가 하고 있다(암호문을 손에 넣는 경로 자체를 닫았다).
 * v1 을 읽을 때마다 로그를 남기므로, 0 이 되는 시점을 보고 그때 v1 수용을 끊으면 된다.
 *
 * 저장 포맷:
 *   v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>            (AAD 없음 — 읽기 전용 레거시)
 *   v2:<iv_b64>:<authTag_b64>:<ciphertext_b64>            (AAD = "<user_id>|<표.컬럼>")
 */

const V1 = "v1";
const V2 = "v2";

/** GCM 표준 96-bit nonce · 128-bit 인증 태그. **길이를 검증한다** — Node 는 4바이트 태그도 받아 준다(감사 확인). */
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * 암호문이 붙어 있는 자리 — 이 값이 AAD 가 된다.
 * field 는 `표.컬럼` 으로 적는다. 같은 사용자의 **다른 컬럼끼리 옮기는 것**도 막기 위해서다
 * (액세스 토큰을 리프레시 토큰 자리에 넣는 것 등).
 */
export interface TokenScope {
  userId: string;
  field:
    | "connected_accounts.access_token_cipher"
    | "connected_accounts.refresh_token_cipher"
    | "meta_ad_connections.access_token_cipher"
    | "subscriptions.billing_key_cipher";
}

function aadOf(scope: TokenScope): Buffer {
  return Buffer.from(`${scope.userId}|${scope.field}`, "utf8");
}

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
  if (key.length !== 32) return null;
  /* ⚠️ `Buffer.from(x, "base64")` 는 **base64 가 아닌 문자를 조용히 버린다.** 그래서 사람이 고른 문장도
     운 좋게 32바이트가 되면 그대로 AES-256 키가 된다 — 엔트로피가 32바이트가 아닌데도 통과한다.
     여기서 **거절하지는 않는다**: 지금 프로덕션에 들어 있는 키를 우리가 볼 수 없고, 거절하면
     전 사용자 연동이 한꺼번에 죽는다. 대신 왕복이 안 맞으면 로그로 남겨 눈에 띄게 한다.
     로그가 보이면 제대로 된 32바이트 키를 새로 만들어 교체하면 된다(교체 절차는 아래 주석 참고). */
  if (key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/")) {
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      consoleErrorThrottled(
        "tokens.weak-key",
        60 * 60 * 1000,
        "[tokens] TOKEN_ENCRYPTION_KEY 가 정상 base64 왕복이 아니다 — 사람이 고른 문장일 수 있다(엔트로피 확인 필요)",
      );
    }
  }
  return key;
}

/**
 * 토큰 암호화 — 키 미설정 시 null (연동 불가).
 * scope 는 **이 값이 저장될 자리**다. 저장하는 행의 소유자·컬럼과 반드시 같아야 한다.
 */
export function encryptToken(plaintext: string, scope: TokenScope): string | null {
  const key = loadKey();
  if (!key) return null;
  if (!scope.userId) {
    /* 소유자를 모르면 봉인하지 않는다 — 빈 AAD 로 봉인하면 그 값은 다시 무기명 토큰이 된다 */
    consoleErrorThrottled("tokens.no-scope", 10 * 60 * 1000, "[tokens] 소유자 없이 암호화 시도 — 거절:", scope.field);
    return null;
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aadOf(scope));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2}:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/**
 * 토큰 복호화 — 키 미설정·포맷 오류·변조·**소유자 불일치** 시 null.
 *
 * v1(레거시)은 AAD 없이 읽어 준다. 그 값들은 다음 갱신·재연동 때 v2 로 다시 쓰인다.
 */
export function decryptToken(stored: string | null | undefined, scope: TokenScope): string | null {
  if (!stored) return null;
  const key = loadKey();
  if (!key) return null;
  const parts = stored.split(":");
  if (parts.length !== 4) return null;
  const version = parts[0];
  if (version !== V1 && version !== V2) return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const enc = Buffer.from(parts[3], "base64");
    /* 길이 검증 — Node 는 짧은 태그도 받아 준다. 4바이트 태그면 위조 성공 확률이 2^32 분의 1 이 되어
       인증이 사실상 무의미해진다(2026-09-08 감사에서 실측 확인). */
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    if (version === V2) decipher.setAAD(aadOf(scope));
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    if (version === V1) {
      /* 남은 v1 을 셀 수 있게 남긴다 — 이 로그가 안 보이면 v1 수용을 끊어도 된다.
         내용은 남기지 않는다(어느 컬럼인지만). */
      consoleErrorThrottled(
        "tokens.v1-read." + scope.field,
        60 * 60 * 1000,
        "[tokens] v1(소유자 결속 없음) 암호문을 읽었다 — 다음 갱신 때 v2 로 다시 봉인된다:",
        scope.field,
      );
    }
    return dec.toString("utf8");
  } catch {
    /* 변조·다른 키·**다른 행에서 옮겨 온 v2 암호문** — 전부 여기로 떨어진다 */
    return null;
  }
}

/** 암호화 키 설정 여부 (연동 가능 여부 판단용) */
export function isTokenEncryptionConfigured(): boolean {
  return loadKey() !== null;
}
