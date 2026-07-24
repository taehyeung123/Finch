import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import {
  exchangeThreadsCodeForToken,
  exchangeThreadsForLongLivedToken,
  fetchThreadsAccountInfo,
  getThreadsOAuthConfig,
  resolveThreadsCallbackUri,
} from "@/lib/meta/threads-oauth";
import { fetchThreadsFollowersCount } from "@/lib/meta/threads";

/**
 * Threads 연동 콜백 — 인가 code를 받아 토큰 교환 → 계정정보 조회 → 암호화 저장.
 * app/api/auth/instagram/callback/route.ts와 동일 구조(CSRF state 대조, 토큰 암호화).
 * 실 스펙: docs/REAL_API_SPEC.md 5절.
 */
export const runtime = "nodejs";

const STATE_COOKIE = "th_oauth_state";

function settingsRedirect(origin: string, params: Record<string, string>): NextResponse {
  const q = new URLSearchParams(params).toString();
  return NextResponse.redirect(`${origin}/settings?${q}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value ?? null;
  // 일회성 state — 결과와 무관하게 즉시 소거
  cookieStore.delete(STATE_COOKIE);

  // 사용자가 인가를 거부했거나 Meta가 에러를 반환
  if (oauthError) {
    return settingsRedirect(origin, { connect: "error", reason: "denied" });
  }
  // CSRF 방어: state 불일치/누락이면 중단
  if (!code || !returnedState || !savedState || returnedState !== savedState) {
    return settingsRedirect(origin, { connect: "error", reason: "state" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/settings`);
  }

  const config = getThreadsOAuthConfig();
  if (!config) {
    return settingsRedirect(origin, { connect: "error", reason: "unconfigured" });
  }
  if (!isTokenEncryptionConfigured()) {
    // 암호화 키 없이 평문 저장하지 않는다 (CLAUDE.md 보안 규칙)
    console.error("[threads-oauth] TOKEN_ENCRYPTION_KEY 미설정 — 연동 중단");
    return settingsRedirect(origin, { connect: "error", reason: "no_encryption_key" });
  }

  try {
    const redirectUri = resolveThreadsCallbackUri(request);
    const shortLived = await exchangeThreadsCodeForToken({ code, redirectUri, config });
    const longLived = await exchangeThreadsForLongLivedToken({ shortLivedToken: shortLived.accessToken, config });
    const info = await fetchThreadsAccountInfo(longLived.accessToken);
    // 프로필 필드엔 팔로워 수가 없어(스펙 6절) insights로 별도 조회 — 실패해도 연동 자체는 진행(0 저장)
    const followersCount = await fetchThreadsFollowersCount(info.id, longLived.accessToken);

    const cipher = encryptToken(longLived.accessToken);
    if (!cipher) {
      return settingsRedirect(origin, { connect: "error", reason: "encrypt_failed" });
    }

    const expiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1000).toISOString();
    const row = {
      user_id: user.id,
      channel: "threads" as const,
      handle: info.username ? `@${info.username}` : `@th_${info.id}`,
      display_name: info.name ?? info.username ?? null,
      bio: info.biography,
      connected: true,
      followers: followersCount,
      posts: 0, // Threads 프로필 필드엔 총 게시물 수가 없다 — getLiveDashboard 로드 시 최근 목록 길이로 근사 갱신
      access_token_cipher: cipher,
      token_expires_at: expiresAt,
      platform_user_id: info.id,
    };
    // 프로필 사진 — 0006 마이그레이션 미적용이면 컬럼이 없어 실패하므로 폴백으로 재시도
    const rowWithAvatar = { ...row, avatar_url: info.profilePictureUrl };

    // 이 사용자의 기존 Threads 연동이 있으면 갱신, 없으면 신규 (앱 모델상 사용자당 Threads 1계정)
    const { data: existing } = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("channel", "threads")
      .limit(1)
      .maybeSingle();

    let write = existing
      ? await supabase.from("connected_accounts").update(rowWithAvatar).eq("id", existing.id)
      : await supabase.from("connected_accounts").insert(rowWithAvatar);
    if (write.error && /avatar_url/i.test(write.error.message)) {
      write = existing
        ? await supabase.from("connected_accounts").update(row).eq("id", existing.id)
        : await supabase.from("connected_accounts").insert(row);
    }

    if (write.error) {
      // (channel, platform_user_id) 전역 유니크 — 다른 핀치 사용자가 이미 연동한 Threads 계정
      if (write.error.code === "23505") {
        return settingsRedirect(origin, { connect: "error", reason: "already_linked" });
      }
      console.error("[threads-oauth] 계정 저장 실패:", write.error.message);
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    return settingsRedirect(origin, { connect: "success", handle: row.handle });
  } catch (e) {
    console.error("[threads-oauth] 콜백 처리 실패:", e instanceof Error ? e.message : String(e));
    return settingsRedirect(origin, { connect: "error", reason: "exchange" });
  }
}
