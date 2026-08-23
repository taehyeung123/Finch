import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";

/*
  비밀번호 페이지(리틀리 「공개/비공개: 비밀번호」 카피, 5단계) — 서버 전용.

  · 저장: PBKDF2-SHA256 100k, 페이지별 임의 salt → "salt$hex" (link_page_secrets.password_hash)
  · 열림 증표: HttpOnly 쿠키에 HMAC(pepper, pageId:hash). 비밀번호를 바꾸면 hash 가 바뀌어
    옛 쿠키가 전부 무효가 된다 — 세션 표를 따로 둘 필요가 없다.
  · pepper 는 env(LINK_COOKIE_SECRET) — 없으면 service_role 키에서 파생(서버에만 있는 값).

  ⚠️ 이 파일은 node:crypto 를 쓴다 — 클라이언트 번들에서 import 하지 말 것.
*/

const ITER = 100_000;
const KEYLEN = 32;

function pepper(): string {
  return process.env.LINK_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "finch-dev-pepper";
}

function derive(pw: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(pw.normalize("NFKC"), salt, ITER, KEYLEN, "sha256", (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPagePassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(pw, salt);
  return `${salt}$${key.toString("hex")}`;
}

export async function verifyPagePassword(pw: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split("$");
  if (!salt || !hex) return false;
  const key = await derive(pw, salt);
  const want = Buffer.from(hex, "hex");
  return key.length === want.length && timingSafeEqual(key, want);
}

/** 열림 쿠키 이름 — 페이지마다 따로(한 브라우저가 여러 페이지를 열 수 있다) */
export function unlockCookieName(pageId: string): string {
  return `finch_lu_${pageId.replace(/-/g, "").slice(0, 16)}`;
}

export function unlockToken(pageId: string, storedHash: string): string {
  return createHmac("sha256", pepper()).update(`${pageId}:${storedHash}`).digest("hex");
}

export function unlockTokenMatches(pageId: string, storedHash: string, cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const want = Buffer.from(unlockToken(pageId, storedHash), "utf8");
  const got = Buffer.from(cookieValue, "utf8");
  return want.length === got.length && timingSafeEqual(want, got);
}

/** 비밀번호 규칙 — 4~32자. 공백만은 안 된다 */
export function validPagePassword(pw: string): boolean {
  const t = pw.trim();
  return t.length >= 4 && t.length <= 32;
}
