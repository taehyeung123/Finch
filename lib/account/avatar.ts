import type { User } from "@supabase/supabase-js";

/**
 * 로그인 계정의 프로필 사진 — Google·카카오가 OAuth 프로필로 넘겨준 URL (2026-09-03).
 *
 * Supabase 는 대부분의 프로바이더를 user_metadata.avatar_url 로 정규화하고, 구글은 picture 도 같이 준다.
 * 둘 다 없으면 identities[].identity_data 를 뒤진다(마지막 로그인이 아닌 다른 프로바이더의 사진도 쓸 수 있게).
 *
 * 카카오 CDN(k.kakaocdn.net)은 http 로 오는 경우가 있다 — https 로 올려 mixed content 를 피한다.
 * http(s) 가 아닌 값(data:·javascript: 등)은 버린다 — 이 문자열은 <img src> 로 나간다.
 */
export function getUserAvatarUrl(user: Pick<User, "user_metadata" | "identities"> | null | undefined): string | null {
  if (!user) return null;
  const candidates: unknown[] = [];
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  candidates.push(meta.avatar_url, meta.picture);
  for (const identity of user.identities ?? []) {
    const data = (identity.identity_data ?? {}) as Record<string, unknown>;
    candidates.push(data.avatar_url, data.picture);
  }
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const trimmed = c.trim();
    if (/^https:\/\//i.test(trimmed)) return trimmed;
    if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice("http://".length)}`;
  }
  return null;
}
