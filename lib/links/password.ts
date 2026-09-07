/* 시크릿(LINK_COOKIE_SECRET·service_role 키)을 읽는 모듈이다 — 이 한 줄이 있으면 클라이언트 그래프에 닿는 순간 **빌드가 실패한다.**
   경계를 사람의 주의력이 아니라 빌드가 지키게 한다(2026-09-07 감사: 같은 저장소의 다른 6개 모듈에는 이미 있었다). */
import "server-only";
import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { MIN_PAGE_PASSWORD } from "./index";

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

/**
 * 비밀번호 규칙 — 6~32자. 공백만은 안 된다.
 *
 * 왜 4에서 6으로 올렸나(2026-09-07 감사): 4자리 숫자는 경우의 수가 1만이다. 시도 상한이
 * 10분에 8회여도 이틀이면 전수 시도가 끝나고, 그 뒤에는 잠긴 콘텐츠와 스냅샷 전체가 열린다.
 * ⚠️ **이미 저장된 4~5자 비밀번호는 그대로 동작한다** — 이 함수는 «새로 정할 때»만 부른다.
 * 여기를 해제 경로에서 부르면 기존 고객의 페이지가 어느 날 갑자기 안 열린다.
 */
export function validPagePassword(pw: string): boolean {
  const t = pw.trim();
  return t.length >= MIN_PAGE_PASSWORD && t.length <= 32;
}
