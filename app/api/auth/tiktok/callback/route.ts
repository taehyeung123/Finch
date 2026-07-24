import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import {
  exchangeTiktokCodeForToken,
  getTiktokOAuthConfig,
  resolveTiktokCallbackUri,
} from "@/lib/tiktok/oauth";
import { fetchTiktokUserInfo } from "@/lib/tiktok/api";

/**
 * TikTok 연동 콜백 — 인가 code를 받아 토큰 교환 → 프로필 조회 → 암호화 저장.
 * app/api/auth/threads/callback/route.ts와 동일 구조(CSRF state 대조, 토큰 암호화)이되,
 * TikTok은 access_token(24시간)·refresh_token(365일)이 분리돼 있어 둘 다 저장한다
 * (refresh_token_cipher — 0011 마이그레이션, lib/tiktok/oauth.ts 상단 주석 참고).
 * 실 스펙: docs/REAL_API_SPEC.md 6절.
 */
export const runtime = "nodejs";

const STATE_COOKIE = "tk_oauth_state";

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

  // 사용자가 인가를 거부했거나 TikTok이 에러를 반환
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

  const config = getTiktokOAuthConfig();
  if (!config) {
    return settingsRedirect(origin, { connect: "error", reason: "unconfigured" });
  }
  if (!isTokenEncryptionConfigured()) {
    // 암호화 키 없이 평문 저장하지 않는다 (CLAUDE.md 보안 규칙)
    console.error("[tiktok-oauth] TOKEN_ENCRYPTION_KEY 미설정 — 연동 중단");
    return settingsRedirect(origin, { connect: "error", reason: "no_encryption_key" });
  }

  try {
    const redirectUri = resolveTiktokCallbackUri(request);
    const token = await exchangeTiktokCodeForToken({ code, redirectUri, config });
    const info = await fetchTiktokUserInfo(token.accessToken);

    const accessCipher = encryptToken(token.accessToken);
    const refreshCipher = encryptToken(token.refreshToken);
    if (!accessCipher || !refreshCipher) {
      return settingsRedirect(origin, { connect: "error", reason: "encrypt_failed" });
    }

    const expiresAt = new Date(Date.now() + token.expiresInSeconds * 1000).toISOString();
    const row = {
      user_id: user.id,
      channel: "tiktok" as const,
      handle: info.username ? `@${info.username}` : `@tk_${info.openId}`,
      display_name: info.displayName ?? info.username ?? null,
      bio: null as string | null, // user.info.profile의 bio_description은 최소 스코프 원칙상 미요청
      connected: true,
      followers: info.followerCount,
      posts: info.videoCount,
      access_token_cipher: accessCipher,
      refresh_token_cipher: refreshCipher,
      token_expires_at: expiresAt,
      platform_user_id: info.openId,
    };
    // 프로필 사진 — 0006 마이그레이션 미적용이면 avatar_url 컬럼이, refresh_token_cipher는 0011
    // 마이그레이션 미적용이면 없어 실패하므로 순차 폴백으로 재시도한다.
    const rowWithAvatar = { ...row, avatar_url: info.avatarUrl };

    // 이 사용자의 기존 TikTok 연동이 있으면 갱신, 없으면 신규 (앱 모델상 사용자당 TikTok 1계정)
    const { data: existing } = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("channel", "tiktok")
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
    if (write.error && /refresh_token_cipher/i.test(write.error.message)) {
      // 0011 미적용 DB — refresh_token 저장은 포기하고 access_token만 저장(다음 갱신 시 재연동 필요)
      const { refresh_token_cipher: _drop, ...withoutRefresh } = row;
      void _drop;
      write = existing
        ? await supabase.from("connected_accounts").update(withoutRefresh).eq("id", existing.id)
        : await supabase.from("connected_accounts").insert(withoutRefresh);
    }

    if (write.error) {
      // (channel, platform_user_id) 전역 유니크 — 다른 핀치 사용자가 이미 연동한 TikTok 계정
      if (write.error.code === "23505") {
        return settingsRedirect(origin, { connect: "error", reason: "already_linked" });
      }
      console.error("[tiktok-oauth] 계정 저장 실패:", write.error.message);
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    return settingsRedirect(origin, { connect: "success", handle: row.handle });
  } catch (e) {
    console.error("[tiktok-oauth] 콜백 처리 실패:", e instanceof Error ? e.message : String(e));
    return settingsRedirect(origin, { connect: "error", reason: "exchange" });
  }
}
