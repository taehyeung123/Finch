import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consoleErrorThrottled, flatten } from "@/lib/monitoring/log-throttle";
import { isPrimaryOwner } from "@/lib/channel-availability";
import { encryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import { isAccountSwitch, type CurrentAccount } from "@/lib/publish/account-core";
import { attributeUnstampedPosts, stopPostsOfPreviousAccount } from "@/lib/publish/account";
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
    /* 인가 화면에 머무는 사이 세션이 사라진 경우(다른 탭 로그아웃·만료). code 는 쓰지 못하고 버려진다 —
       예전엔 로그도 안 남고 로그인 뒤 화면에도 아무 결과가 없어 «승인했는데 왜 안 붙었지»를 알 길이 없었다(2026-09-09 감사).
       인증 전 경로라 스로틀 로그. next 에 결과 쿼리를 실어 로그인 뒤 모달로 말한다(safe-next 는 same-origin 상대경로를 통과시킨다). */
    consoleErrorThrottled(`oauth.no_session.${TAG}`, 10 * 60 * 1000, `[${TAG}] 콜백 도착 시 세션 없음 — code 폐기`);
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent("/settings/channels?connect=error&reason=session")}`);
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

  /* 토큰 암호문을 쓰는 조회·저장은 **service_role 로** 한다(마이그레이션 0085, 2026-09-07 감사).
     0085 가 access_token_cipher·refresh_token_cipher 를 authenticated 의 SELECT/INSERT/UPDATE
     대상에서 빼기 때문에, 세션 클라이언트로는 이 저장이 더 이상 통하지 않는다.
     행 범위는 아래 `user_id: user.id` 와 `.eq("user_id", user.id)` 가 정한다. */
  const store = createAdminClient() ?? supabase;
  /* 여기서만 세션 클라이언트 폴백을 남긴다 — 이 경로는 **본인이 자기 토큰을 쓰는** 자리라
     폴백이 열어 주는 것이 없다(RLS 가 본인 행으로 묶는다). 읽기 경로(lib/data/live.ts·ads.ts)는
     반대다: 거기서의 폴백은 «팀원이 소유자 암호문을 읽는» 바로 그 조회를 되살리므로 닫아 두었다. */

  /* 어느 단계에서 실패했는지 추적한다.
     예전엔 세 호출을 try 하나로 묶고 전부 «토큰 교환 중 오류» 로 뭉갰는데,
     그러면 **원인을 좁힐 수가 없다** — 앱 시크릿 문제인지, redirect_uri 불일치인지,
     계정 유형(개인 계정) 문제인지가 전부 같은 문구로 나왔다(2026-08-31 실제로 여기서 막혔다).
     사용자에게는 «무엇을 하면 되는지»가 다르므로 문구도 갈라야 한다. */
  let stage: "code" | "longlived" | "account" = "code";
  /* 진단용으로 catch 에서도 읽는다 — «어떤 주소를 보냈는지»가 이 오류의 핵심 정보다 */
  const redirectUri = resolveCallbackUri(request);

  try {
    console.info("[" + TAG + "] 토큰 교환 시작 redirect_uri=" + redirectUri);
    const shortLived = await exchangeCodeForToken({ code, redirectUri, config });
    stage = "longlived";
    const longLived = await exchangeForLongLivedToken({ shortLivedToken: shortLived.accessToken, config });
    stage = "account";
    const info = await fetchAccountInfo(longLived.accessToken);

    const cipher = encryptToken(longLived.accessToken, { userId: user.id, field: "connected_accounts.access_token_cipher" });
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
      /* 모르면(null) 컬럼을 아예 안 보낸다 — 신규는 DB 기본값 0 으로 시작하고, **재연동(UPDATE)** 은 이전 값을 지키다.
         예전엔 `?? 0` 이라 팔로워 수가 안 오는 계정(100명 미만)을 다시 연결하면 저장돼 있던 값이 0 으로 덮였다
         (2026-09-09 감사). 갱신 경로(live.ts·refresh-tokens)와 같은 규칙이다. */
      ...(info.followersCount !== null && info.followersCount !== undefined ? { followers: info.followersCount } : {}),
      ...(info.mediaCount !== null && info.mediaCount !== undefined ? { posts: info.mediaCount } : {}),
      access_token_cipher: cipher,
      token_expires_at: expiresAt,
      /* platform_user_id = 앱 범위 id(해제 콜백이 대조), ig_id = 프로페셔널 계정 ID(웹훅 entry.id) — 둘은 다른 값이다(0091) */
      platform_user_id: info.id,
      ig_id: info.igId,
      /* 동의 시점에 실제로 받은 권한 — 스코프는 여기서 고정되므로 나중에 배열을 늘려도
         이 토큰은 안 바뀐다. 기록해 두면 «예약 발행이 새벽에 권한 오류로 실패»하기 전에
         화면에서 재연동을 안내할 수 있다(0075). 응답에 permissions 가 없으면 빈 배열이 오는데,
         그건 «권한 없음»이 아니라 «모름»이라 **null 을 쓴다**(null = 확인 불가, 관문은 통과시킨다).
         ⚠️ 모를 때 컬럼을 «안 건드리면» 재연동(UPDATE)에서 **옛 토큰의 권한이 새 토큰의 것으로 남는다** —
         발행 권한을 빼고 다시 승인했는데 관문이 통과시키고 발행 시각에야 실패하는 경로였다(2026-09-09 감사).
         0075 미적용 DB 는 아래 폴백이 이 키를 떼고 다시 쓴다. */
      granted_scopes: shortLived.permissions.length > 0 ? shortLived.permissions : null,
    };
    // 프로필 사진 — 0006 마이그레이션 미적용이면 컬럼이 없어 실패하므로 폴백으로 재시도
    const rowWithAvatar = { ...row, avatar_url: info.profilePictureUrl };

    // 이 사용자의 기존 인스타 연동이 있으면 갱신, 없으면 신규 (앱 모델상 사용자당 IG 1계정)
    const { data: existing } = await store
      .from("connected_accounts")
      .select("id, platform_user_id, handle")
      .eq("user_id", user.id)
      .eq("channel", "instagram")
      .limit(1)
      .maybeSingle();

    /* 다른 계정으로 바꾸기(2026-09-12) — 재연결은 이 행을 **제자리에서** 고친다. 고치고 나면 옛 계정 id 를 알 곳이 없으므로
       그 전에 대상이 비어 있는 글(0094 전 옛 글)에 옛 계정을 적는다 — 옛 발행 이력이 새 계정 것처럼 보이지 않고, 옛 예약이
       새 계정으로 새지 않는다(lib/publish/account.ts). 같은 계정 재연결은 아무것도 바꾸지 않는다.
       발행 글 쓰기는 서버 전용 칸·상태 전이라 admin 이다 — 없으면 로그만(폴백 없음 — 발행 때 엔진이 대상 계정을 보고 막는다). */
    const prevAccount: CurrentAccount | null =
      existing && isAccountSwitch(existing.platform_user_id, info.id)
        ? { platformUserId: String(existing.platform_user_id), handle: typeof existing.handle === "string" ? existing.handle : null }
        : null;
    const switchAdmin = prevAccount ? createAdminClient() : null;
    /* 이 시각 전에 잡힌 «대상 없는» 예약은 새 계정 것이 아니다(stopPostsOfPreviousAccount) */
    const switchStartedAt = new Date().toISOString();
    if (prevAccount) {
      if (!switchAdmin) console.error("[" + TAG + "] 계정 전환 — 서버 자격증명 미설정, 옛 계정 글 정리 불가(발행 때 엔진이 막는다)");
      else await attributeUnstampedPosts(switchAdmin, user.id, "instagram", prevAccount);
    }

    let write = existing
      ? await store.from("connected_accounts").update(rowWithAvatar).eq("id", existing.id).select("id")
      : await store.from("connected_accounts").insert(rowWithAvatar).select("id");
    if (write.error && /granted_scopes/i.test(write.error.message)) {
      // 0075 미적용 DB — 스코프 기록은 포기하고 나머지는 저장한다(계단식 폴백)
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
    if (write.error && /ig_id/i.test(write.error.message)) {
      // 0091 미적용 DB — 웹훅용 ID 기록만 포기하고 나머지는 저장한다(웹훅은 platform_user_id 로 한 번 더 찾는다)
      const { ig_id: _i, ...withoutIg } = rowWithAvatar as Record<string, unknown>;
      void _i;
      write = existing
        ? await store.from("connected_accounts").update(withoutIg).eq("id", existing.id).select("id")
        : await store.from("connected_accounts").insert(withoutIg).select("id");
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
       사용자에게는 «연동이 완료되었어요» 모달만 뜬다. 몇 번을 눌러도 같고 로그도 안 남는다.
       같은 함정을 연동 해제(settings/actions.ts)는 이미 .select() 로 막고 있었다. */
    if (!write.data || write.data.length === 0) {
      console.error("[ig-oauth] 저장 결과 0행 — RLS 로 막혔을 가능성(user_id 불일치)");
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }

    /* 계정이 실제로 바뀐 **뒤에** 옛 계정 대상의 예약·처리 중(발행 시도 전) 글을 곧바로 실패로 내린다 — 예약 시각에 조용히
       실패하게 두지 않는다. 저장 전에 하면 저장이 막힌 경우(23505 — 다른 사용자가 이미 연결한 계정)에 멀쩡한 예약만 떨어진다. */
    let stopped = 0;
    if (prevAccount && switchAdmin) {
      stopped = await stopPostsOfPreviousAccount(switchAdmin, user.id, "instagram", prevAccount, switchStartedAt);
      revalidatePath("/publish");
    }
    const stoppedParam: Record<string, string> = stopped > 0 ? { stopped: String(stopped) } : {};

    /* 계정별 웹훅 구독 — 이게 없으면 이 계정의 댓글/메시지 웹훅이 **발송되지 않는다**(자동 DM 필수).
       연동 자체는 유효하므로 실패해도 되돌리지 않지만, **성공으로 덮지도 않는다.**
       예전엔 console.error 하나로 끝냈는데, 그러면 사용자는 «연동 완료» 를 보고 규칙을 만들고
       댓글이 달려도 DM 이 한 통도 안 나가는데 화면 어디에도 오류가 없다.
       재연동이 곧 재시도라, 사용자가 할 수 있는 일을 화면에서 말해 준다. */
    const sub = await subscribeWebhookFields(longLived.accessToken);
    if (!sub.ok) {
      console.error("[" + TAG + "] 웹훅 구독 실패(연동은 유지):", sub.error);
      return settingsRedirect(origin, { connect: "warn", reason: "partial_webhook", handle: row.handle, ...stoppedParam });
    }

    return settingsRedirect(origin, { connect: "success", handle: row.handle, ...stoppedParam });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[" + TAG + "] 콜백 처리 실패 stage=" + stage + ":", msg);
    /* 단계별로 사용자가 할 일이 다르다:
       code      — 앱 자격증명·콜백 주소 문제(운영자가 고칠 것)
       longlived — 단기→장기 교환 실패. 시크릿 문제일 때가 많다
       account   — 토큰은 받았는데 프로필을 못 읽는다. **개인 계정**이 대표 원인이다 */
    const reason =
      stage === "account" ? "account_info" : stage === "longlived" ? "exchange_longlived" : "exchange_code";
    /* 원문을 detail 로 함께 넘긴다 — 화면은 **운영자에게만** 보여준다(설정 화면에서 판정).
       로그만으로는 원인을 못 찾는 상황이 실제로 벌어졌다(2026-08-31): Vercel 로그를 뒤져도
       안 나오고, 세 번을 시도해도 같은 문구만 반복돼 추측만 쌓였다.
       고객에게는 여전히 안 보인다 — CLAUDE.md 내부 운영 정보 비노출 규칙을 지킨다. */
    /* 우리가 실제로 보낸 redirect_uri 를 함께 보여준다.
       메타 앱에 등록된 값과 **글자 단위로** 다른 곳을 눈으로 찾을 수 있어야 한다. */
    /* ⚠️ detail 은 **운영자 요청일 때만** 붙인다. 예전엔 모든 고객의 주소창·방문 기록에 인가 서버 원문이
       실려 나갔고, 화면에서 가리는 것만으로는 그게 안 지워졌다(2026-09-06 적발). 원문은 여기 로그와 Sentry 에 남는다.
       **주 운영자만**(isPrimaryOwner) — OWNER_EMAIL 의 나머지는 심사 전용 계정이라 원문이 «미완성»으로 읽힌다(2026-09-11). */
    const forOwner = isPrimaryOwner(user.email);
    return settingsRedirect(origin, {
      connect: "error",
      reason,
      ...(forOwner ? { detail: (msg + " | redirect_uri=" + redirectUri).slice(0, 400) } : {}),
    });
  }
}
