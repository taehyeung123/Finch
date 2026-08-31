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

/** 로그 접두 — 세 채널이 같은 형태로 남아야 원인을 대조할 수 있다 */
const TAG = "ig-oauth";

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
      /* 최초 저장이라 비교할 이전 값이 없다 — 모르면 0 으로 시작한다.
         이후 갱신 경로(live.ts)는 null 일 때 컬럼을 아예 건드리지 않는다. */
      followers: info.followersCount ?? 0,
      posts: info.mediaCount ?? 0,
      access_token_cipher: cipher,
      token_expires_at: expiresAt,
      platform_user_id: info.id,
      /* 동의 시점에 실제로 받은 권한 — 스코프는 여기서 고정되므로 나중에 배열을 늘려도
         이 토큰은 안 바뀐다. 기록해 두면 «예약 발행이 새벽에 권한 오류로 실패»하기 전에
         화면에서 재연동을 안내할 수 있다(0075). 응답에 permissions 가 없으면 빈 배열이 오는데,
         그건 «권한 없음»이 아니라 «모름»이라 컬럼을 아예 비워 둔다. */
      ...(shortLived.permissions.length > 0 ? { granted_scopes: shortLived.permissions } : {}),
    };
    // 프로필 사진 — 0006 마이그레이션 미적용이면 컬럼이 없어 실패하므로 폴백으로 재시도
    const rowWithAvatar = { ...row, avatar_url: info.profilePictureUrl };

    // 이 사용자의 기존 인스타 연동이 있으면 갱신, 없으면 신규 (앱 모델상 사용자당 IG 1계정)
    const { data: existing } = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("channel", "instagram")
      .limit(1)
      .maybeSingle();

    let write = existing
      ? await supabase.from("connected_accounts").update(rowWithAvatar).eq("id", existing.id).select("id")
      : await supabase.from("connected_accounts").insert(rowWithAvatar).select("id");
    if (write.error && /granted_scopes/i.test(write.error.message)) {
      // 0075 미적용 DB — 스코프 기록은 포기하고 나머지는 저장한다(계단식 폴백)
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

    if (write.error) {
      // (channel, platform_user_id) 전역 유니크 — 다른 핀치 사용자가 이미 연동한 IG 계정
      if (write.error.code === "23505") {
        return settingsRedirect(origin, { connect: "error", reason: "already_linked" });
      }
      console.error("[ig-oauth] 계정 저장 실패:", write.error.message);
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    /* ⚠️ error 만 보면 안 된다 — PostgREST 는 조건에 맞는 행이 **0개여도 오류를 내지 않는다.**
       팀 멤버가 연동할 때 실제로 이 경로를 탄다: 읽기 정책은 소유자 행까지 열어 주는데
       쓰기 정책은 본인 행만 허용하므로, 소유자 행 id 를 잡아 UPDATE 하면 0행이 갱신되고
       사용자에게는 «연동이 완료되었어요» 배너만 뜬다. 몇 번을 눌러도 같고 로그도 안 남는다.
       같은 함정을 연동 해제(settings/actions.ts)는 이미 .select() 로 막고 있었다. */
    if (!write.data || write.data.length === 0) {
      console.error("[ig-oauth] 저장 결과 0행 — RLS 로 막혔을 가능성(user_id 불일치)");
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    /* 계정별 웹훅 구독 — 이게 없으면 이 계정의 댓글/메시지 웹훅이 **발송되지 않는다**(자동 DM 필수).
       연동 자체는 유효하므로 실패해도 되돌리지 않지만, **성공으로 덮지도 않는다.**
       예전엔 console.error 하나로 끝냈는데, 그러면 사용자는 «연동 완료» 를 보고 규칙을 만들고
       댓글이 달려도 DM 이 한 통도 안 나가는데 화면 어디에도 오류가 없다.
       재연동이 곧 재시도라, 사용자가 할 수 있는 일을 화면에서 말해 준다. */
    const sub = await subscribeWebhookFields(longLived.accessToken);
    if (!sub.ok) {
      console.error("[" + TAG + "] 웹훅 구독 실패(연동은 유지):", sub.error);
      return settingsRedirect(origin, { connect: "warn", reason: "partial_webhook", handle: row.handle });
    }

    return settingsRedirect(origin, { connect: "success", handle: row.handle });
  } catch (e) {
    console.error("[ig-oauth] 콜백 처리 실패:", e instanceof Error ? e.message : String(e));
    return settingsRedirect(origin, { connect: "error", reason: "exchange" });
  }
}
