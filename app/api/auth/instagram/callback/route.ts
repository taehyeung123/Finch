import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchAccountInfo,
  getInstagramOAuthConfig,
  resolveCallbackUri,
  subscribeWebhookFields,
} from "@/lib/meta/instagram-oauth";

/**
 * 인스타그램 연동 콜백 — 인가 code를 받아 토큰 교환 → 계정정보 조회 → 암호화 저장.
 * CSRF: start에서 심은 state 쿠키와 대조. 토큰은 lib/crypto/tokens로 암호화(평문 저장 금지).
 * 실 스펙: docs/REAL_API_SPEC.md 1절.
 */
export const runtime = "nodejs";

const STATE_COOKIE = "ig_oauth_state";

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

  const config = getInstagramOAuthConfig();
  if (!config) {
    return settingsRedirect(origin, { connect: "error", reason: "unconfigured" });
  }
  if (!isTokenEncryptionConfigured()) {
    // 암호화 키 없이 평문 저장하지 않는다 (CLAUDE.md 보안 규칙)
    console.error("[ig-oauth] TOKEN_ENCRYPTION_KEY 미설정 — 연동 중단");
    return settingsRedirect(origin, { connect: "error", reason: "no_encryption_key" });
  }

  try {
    const redirectUri = resolveCallbackUri(request);
    const shortLived = await exchangeCodeForToken({ code, redirectUri, config });
    const longLived = await exchangeForLongLivedToken({ shortLivedToken: shortLived.accessToken, config });
    const info = await fetchAccountInfo(longLived.accessToken);

    const cipher = encryptToken(longLived.accessToken);
    if (!cipher) {
      return settingsRedirect(origin, { connect: "error", reason: "encrypt_failed" });
    }

    const expiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1000).toISOString();
    const row = {
      user_id: user.id,
      channel: "instagram" as const,
      handle: info.username ? `@${info.username}` : `@ig_${info.id}`,
      display_name: info.name ?? info.username ?? null,
      bio: info.biography,
      connected: true,
      followers: info.followersCount,
      posts: info.mediaCount,
      access_token_cipher: cipher,
      token_expires_at: expiresAt,
      platform_user_id: info.id,
    };

    // 이 사용자의 기존 인스타 연동이 있으면 갱신, 없으면 신규 (앱 모델상 사용자당 IG 1계정)
    const { data: existing } = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("channel", "instagram")
      .limit(1)
      .maybeSingle();

    const write = existing
      ? await supabase.from("connected_accounts").update(row).eq("id", existing.id)
      : await supabase.from("connected_accounts").insert(row);

    if (write.error) {
      // (channel, platform_user_id) 전역 유니크 — 다른 핀치 사용자가 이미 연동한 IG 계정
      if (write.error.code === "23505") {
        return settingsRedirect(origin, { connect: "error", reason: "already_linked" });
      }
      console.error("[ig-oauth] 계정 저장 실패:", write.error.message);
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    // 계정별 웹훅 구독 — 이게 없으면 이 계정의 댓글/메시지 웹훅이 발송되지 않는다(자동 DM 필수).
    // 실패해도 연동은 유효 — 로그만 남긴다 (재연동 시 재시도됨).
    const sub = await subscribeWebhookFields(longLived.accessToken);
    if (!sub.ok) {
      console.error("[ig-oauth] 웹훅 구독 실패(연동은 유지):", sub.error);
    }

    return settingsRedirect(origin, { connect: "success", handle: row.handle });
  } catch (e) {
    console.error("[ig-oauth] 콜백 처리 실패:", e instanceof Error ? e.message : String(e));
    return settingsRedirect(origin, { connect: "error", reason: "exchange" });
  }
}
