import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consoleErrorThrottled, flatten } from "@/lib/monitoring/log-throttle";
import { encryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import { isAccountSwitch, type CurrentAccount } from "@/lib/publish/account-core";
import { attributeUnstampedPosts, stopPostsOfPreviousAccount } from "@/lib/publish/account";
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

/** 로그 접두 — 세 채널이 같은 형태로 남아야 원인을 대조할 수 있다 */
const TAG = "threads-oauth";

const STATE_COOKIE = "th_oauth_state";

function settingsRedirect(origin: string, params: Record<string, string>): NextResponse {
  const q = new URLSearchParams(params).toString();
  return NextResponse.redirect(`${origin}/settings/channels?${q}`);
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
    /* ⚠️ 인증 «전» 경로다 — 공격자가 이 세 값을 마음대로 정한다. 스로틀 없이 흘리면 외부인이
       Sentry 무료 한도를 태워 **우리의 유일한 오류 관측 수단을 끌 수 있다**(2026-09-07 감사).
       개행 제거·길이 절단은 로그 위조를 막고, 동시에 메시지 다양성을 죽여 dedupe 가 실제로 일하게 한다. */
    consoleErrorThrottled(
      "oauth.denied." + TAG,
      10 * 60 * 1000,
      `[${TAG}] 인가 실패:`,
      flatten(oauthError, 40),
      flatten(errReason, 40),
      flatten(errDesc, 120),
    );
    /* «취소했다»고 말하려면 **사용자가 취소했다는 신호**가 있어야 한다. access_denied 는 인가 서버가 계정을
       거절할 때도 같이 온다 — 그것까지 취소로 뭉개면 아무것도 안 누른 사람에게 「연결을 취소했어요」라고
       거짓말을 한다(2026-09-06 적발). 신호가 없으면 「아직 연결 권한이 없어요」쪽으로 보낸다. */
    const userCancelled = /user_denied|user_cancel/i.test(errReason) || /user_denied|user_cancel/i.test(errDesc);
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
    /* 인가 화면에 머무는 사이 세션이 사라진 경우 — 인스타 콜백과 같은 처리(2026-09-09 감사) */
    consoleErrorThrottled(`oauth.no_session.${TAG}`, 10 * 60 * 1000, `[${TAG}] 콜백 도착 시 세션 없음 — code 폐기`);
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/settings/channels?connect=error&reason=session")}`);
  }

  /* 토큰 암호문을 쓰는 조회·저장은 **service_role 로** 한다(마이그레이션 0085, 2026-09-07 감사).
     0085 가 토큰 암호문 컬럼을 authenticated 의 SELECT/INSERT/UPDATE 대상에서 빼기 때문에,
     세션 클라이언트로는 이 저장이 더 이상 통하지 않는다.
     행 범위는 아래 `user_id: user.id` 와 `.eq("user_id", user.id)` 가 정한다. */
  const store = createAdminClient() ?? supabase;
  /* 여기서만 세션 클라이언트 폴백을 남긴다 — 이 경로는 **본인이 자기 토큰을 쓰는** 자리라
     폴백이 열어 주는 것이 없다(RLS 가 본인 행으로 묶는다). 읽기 경로(lib/data/live.ts·ads.ts)는
     반대다: 거기서의 폴백은 «팀원이 소유자 암호문을 읽는» 바로 그 조회를 되살리므로 닫아 두었다. */

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
    /* 프로필 필드엔 팔로워 수가 없어(스펙 5절) insights 로 별도 조회.
       실패해도 연동 자체는 진행한다 — null 은 «모름»이라 아래에서 컬럼을 아예 안 보낸다(재연동 때 이전 값을 0 으로
       덮지 않게 — 2026-09-09 감사). 신규는 DB 기본값 0, 이후 갱신 경로(live.ts·크론)도 같은 규칙이다. */
    const followersCount = await fetchThreadsFollowersCount(info.id, longLived.accessToken);

    const cipher = encryptToken(longLived.accessToken, { userId: user.id, field: "connected_accounts.access_token_cipher" });
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
      ...(followersCount !== null ? { followers: followersCount } : {}),
      /* posts 는 넣지 않는다 — Threads 프로필엔 총 게시물 수가 없다. 예전의 `posts: 0` 은 재연동마다 근사값을 0 으로
         되돌렸다. 신규는 DB 기본값 0, 이후 getLiveDashboard 가 최근 목록 길이로 근사 갱신한다. */
      access_token_cipher: cipher,
      token_expires_at: expiresAt,
      platform_user_id: info.id,
      /* 인스타와 같은 규칙 — 동의 시점 권한을 기록해 두면 «발행 권한 없는 토큰» 을
         새벽 크론이 아니라 예약하는 순간에 잡을 수 있다(0075).
         Threads 응답의 permissions 는 스펙에 명시돼 있지 않아 빈 배열로 올 수 있는데,
         그건 «권한 없음» 이 아니라 «모름» 이라 **null 을 쓴다**. 모를 때 컬럼을 안 건드리면 재연동(UPDATE)에서
         옛 토큰의 권한이 새 토큰의 것으로 남는다(2026-09-09 감사) — 인스타 콜백과 같은 규칙. */
      granted_scopes: shortLived.permissions.length > 0 ? shortLived.permissions : null,
    };
    // 프로필 사진 — 0006 마이그레이션 미적용이면 컬럼이 없어 실패하므로 폴백으로 재시도
    const rowWithAvatar = { ...row, avatar_url: info.profilePictureUrl };

    // 이 사용자의 기존 Threads 연동이 있으면 갱신, 없으면 신규 (앱 모델상 사용자당 Threads 1계정)
    const { data: existing } = await store
      .from("connected_accounts")
      .select("id, platform_user_id, handle")
      .eq("user_id", user.id)
      .eq("channel", "threads")
      .limit(1)
      .maybeSingle();

    /* 다른 계정으로 바꾸기(2026-09-12) — 인스타 콜백과 같은 규칙(그 파일 주석). 행을 고치기 전에 옛 계정을 대상이 빈 글에 적는다.
       같은 계정 재연결은 아무것도 바꾸지 않는다. admin 이 없으면 로그만(폴백 없음 — 발행 때 엔진이 대상 계정을 보고 막는다). */
    const prevAccount: CurrentAccount | null =
      existing && isAccountSwitch(existing.platform_user_id, info.id)
        ? { platformUserId: String(existing.platform_user_id), handle: typeof existing.handle === "string" ? existing.handle : null }
        : null;
    const switchAdmin = prevAccount ? createAdminClient() : null;
    /* 이 시각 전에 잡힌 «대상 없는» 예약은 새 계정 것이 아니다(stopPostsOfPreviousAccount) */
    const switchStartedAt = new Date().toISOString();
    if (prevAccount) {
      if (!switchAdmin) console.error("[" + TAG + "] 계정 전환 — 서버 자격증명 미설정, 옛 계정 글 정리 불가(발행 때 엔진이 막는다)");
      else await attributeUnstampedPosts(switchAdmin, user.id, "threads", prevAccount);
    }

    let write = existing
      ? await store.from("connected_accounts").update(rowWithAvatar).eq("id", existing.id).select("id")
      : await store.from("connected_accounts").insert(rowWithAvatar).select("id");
    if (write.error && /granted_scopes/i.test(write.error.message)) {
      // 0075 미적용 DB — 스코프 기록만 포기하고 나머지는 저장한다(계단식 폴백)
      const { granted_scopes: _s, ...withoutScopes } = rowWithAvatar as Record<string, unknown>;
      void _s;
      write = existing
        ? await store.from("connected_accounts").update(withoutScopes).eq("id", existing.id).select("id")
        : await store.from("connected_accounts").insert(withoutScopes).select("id");
    }
    if (write.error && /avatar_url/i.test(write.error.message)) {
      write = existing
        ? await store.from("connected_accounts").update(row).eq("id", existing.id).select("id")
        : await store.from("connected_accounts").insert(row).select("id");
    }

    if (write.error) {
      // (channel, platform_user_id) 전역 유니크 — 다른 핀치 사용자가 이미 연동한 Threads 계정
      if (write.error.code === "23505") {
        return settingsRedirect(origin, { connect: "error", reason: "already_linked" });
      }
      console.error("[threads-oauth] 계정 저장 실패:", write.error.message);
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    /* ⚠️ error 만 보면 안 된다 — PostgREST 는 조건에 맞는 행이 **0개여도 오류를 내지 않는다.**
       팀 멤버가 연동할 때 실제로 이 경로를 탄다: 읽기 정책은 소유자 행까지 열어 주는데
       쓰기 정책은 본인 행만 허용하므로, 소유자 행 id 를 잡아 UPDATE 하면 0행이 갱신되고
       사용자에게는 «연동이 완료되었어요» 모달만 뜬다. 몇 번을 눌러도 같고 로그도 안 남는다.
       같은 함정을 연동 해제(settings/actions.ts)는 이미 .select() 로 막고 있었다. */
    if (!write.data || write.data.length === 0) {
      console.error("[threads-oauth] 저장 결과 0행 — RLS 로 막혔을 가능성(user_id 불일치)");
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    /* 계정이 실제로 바뀐 **뒤에** 옛 계정 대상의 예약·처리 중(발행 시도 전) 글을 곧바로 실패로 내린다(인스타 콜백과 같은 이유) */
    let stopped = 0;
    if (prevAccount && switchAdmin) {
      stopped = await stopPostsOfPreviousAccount(switchAdmin, user.id, "threads", prevAccount, switchStartedAt);
      revalidatePath("/publish");
    }

    return settingsRedirect(origin, { connect: "success", handle: row.handle, ...(stopped > 0 ? { stopped: String(stopped) } : {}) });
  } catch (e) {
    console.error("[threads-oauth] 콜백 처리 실패:", e instanceof Error ? e.message : String(e));
    return settingsRedirect(origin, { connect: "error", reason: "exchange" });
  }
}
