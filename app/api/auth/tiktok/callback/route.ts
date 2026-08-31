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

/** 로그 접두 — 세 채널이 같은 형태로 남아야 원인을 대조할 수 있다 */
const TAG = "tiktok-oauth";

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

  /* 인가 서버가 error 를 달고 돌려보낸 경우.
     ⚠️ 이걸 전부 «연동이 취소되었습니다» 로 뭉개면 안 된다 — 개통 첫날 가장 흔한 원인은
     «테스터로 등록되지 않은 계정»·«심사 미승인 스코프»이고, 아무도 취소하지 않았다.
     원인은 error_reason·error_description 에 온다. 화면 문구는 갈라 주고, 상세는 로그로 남긴다
     (고객 화면에 인가 서버 원문을 그대로 뿌리지는 않는다 — 내부 운영 정보다). */
  if (oauthError) {
    const errReason = url.searchParams.get("error_reason") ?? "";
    const errDesc = url.searchParams.get("error_description") ?? "";
    console.error("[" + TAG + "] 인가 실패:", oauthError, errReason, errDesc);
    const userCancelled = /access_denied/i.test(oauthError) || /user_denied|user_cancel/i.test(errReason);
    return settingsRedirect(origin, {
      connect: "error",
      reason: userCancelled ? "denied" : "not_allowed",
    });
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
      /* 인스타·스레드와 같은 규칙 — 동의 시점 권한을 기록해 둔다(0075).
         ⚠️ 틱톡만 응답 모양이 다르다: permissions 배열이 아니라 **scope 콤마 문자열**이다.
         빈 문자열이면 «권한 없음»이 아니라 «모름»이라 컬럼을 아예 비워 둔다. */
      ...(token.scope
        ? { granted_scopes: token.scope.split(",").map((v) => v.trim()).filter(Boolean) }
        : {}),
    };
    // 프로필 사진 — 0006 마이그레이션 미적용이면 avatar_url 컬럼이, refresh_token_cipher는 0011
    // 마이그레이션 미적용이면 없어 실패하므로 순차 폴백으로 재시도한다.
    const rowWithAvatar = { ...row, avatar_url: info.avatarUrl };

    // 이 사용자의 기존 TikTok 연동이 있으면 갱신, 없으면 신규 (앱 모델상 사용자당 TikTok 1계정)
    const { data: existing } = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("channel", "tiktok")
      .limit(1)
      .maybeSingle();

    let write = existing
      ? await supabase.from("connected_accounts").update(rowWithAvatar).eq("id", existing.id).select("id")
      : await supabase.from("connected_accounts").insert(rowWithAvatar).select("id");
    if (write.error && /granted_scopes/i.test(write.error.message)) {
      // 0075 미적용 DB — 스코프 기록만 포기하고 나머지는 저장한다(계단식 폴백)
      const { granted_scopes: _s, ...withoutScopes } = rowWithAvatar as Record<string, unknown>;
      void _s;
      write = existing
        ? await supabase.from("connected_accounts").update(withoutScopes).eq("id", existing.id).select("id")
        : await supabase.from("connected_accounts").insert(withoutScopes).select("id");
    }
    if (write.error && /avatar_url/i.test(write.error.message)) {
      write = existing
        ? await supabase.from("connected_accounts").update(row).eq("id", existing.id).select("id")
        : await supabase.from("connected_accounts").insert(row).select("id");
    }
    if (write.error && /refresh_token_cipher/i.test(write.error.message)) {
      // 0011 미적용 DB — refresh_token 저장은 포기하고 access_token만 저장(다음 갱신 시 재연동 필요)
      const { refresh_token_cipher: _drop, ...withoutRefresh } = row;
      void _drop;
      write = existing
        ? await supabase.from("connected_accounts").update(withoutRefresh).eq("id", existing.id).select("id")
        : await supabase.from("connected_accounts").insert(withoutRefresh).select("id");
    }

    if (write.error) {
      // (channel, platform_user_id) 전역 유니크 — 다른 핀치 사용자가 이미 연동한 TikTok 계정
      if (write.error.code === "23505") {
        return settingsRedirect(origin, { connect: "error", reason: "already_linked" });
      }
      console.error("[tiktok-oauth] 계정 저장 실패:", write.error.message);
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    /* ⚠️ error 만 보면 안 된다 — PostgREST 는 조건에 맞는 행이 **0개여도 오류를 내지 않는다.**
       팀 멤버가 연동할 때 실제로 이 경로를 탄다: 읽기 정책은 소유자 행까지 열어 주는데
       쓰기 정책은 본인 행만 허용하므로, 소유자 행 id 를 잡아 UPDATE 하면 0행이 갱신되고
       사용자에게는 «연동이 완료되었어요» 배너만 뜬다. 몇 번을 눌러도 같고 로그도 안 남는다.
       같은 함정을 연동 해제(settings/actions.ts)는 이미 .select() 로 막고 있었다. */
    if (!write.data || write.data.length === 0) {
      console.error("[tiktok-oauth] 저장 결과 0행 — RLS 로 막혔을 가능성(user_id 불일치)");
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    return settingsRedirect(origin, { connect: "success", handle: row.handle });
  } catch (e) {
    console.error("[tiktok-oauth] 콜백 처리 실패:", e instanceof Error ? e.message : String(e));
    return settingsRedirect(origin, { connect: "error", reason: "exchange" });
  }
}
