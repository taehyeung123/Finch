import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consoleErrorThrottled, flatten } from "@/lib/monitoring/log-throttle";
import { isOwnerEmail } from "@/lib/channel-availability";
import { encryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import {
  exchangeAdsCodeForToken,
  exchangeAdsForLongLivedToken,
  fetchFbMe,
  fetchGrantedFbScopes,
  getMetaAdsOAuthConfig,
  resolveAdsCallbackUri,
} from "@/lib/meta/ads-oauth";
import { fetchAdAccounts } from "@/lib/meta/ads";
import { isMissingColumnError } from "@/lib/publish-rules";
import { isMissingTableError } from "@/lib/supabase/errors";

/**
 * 메타 광고 연동 콜백 — code → 장기 토큰 → 광고 계정 목록 → 저장.
 *
 * 인스타와 달리 **표가 둘**이다(0077):
 *   meta_ad_connections — 사람 하나 = 토큰 하나
 *   meta_ad_accounts    — 그 사람이 접근 가능한 광고 계정 N개
 * FB 사용자 토큰 하나가 /me/adaccounts 전부를 커버하므로 토큰을 계정마다 복사하지 않는다.
 */
export const runtime = "nodejs";

const TAG = "meta-ads-oauth";
const STATE_COOKIE = "meta_ads_oauth_state";

function settingsRedirect(origin: string, params: Record<string, string>): NextResponse {
  return NextResponse.redirect(`${origin}/settings/channels?${new URLSearchParams(params).toString()}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE)?.value ?? null;
  cookieStore.delete(STATE_COOKIE);

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
  if (!code || !returnedState || !savedState || returnedState !== savedState) {
    return settingsRedirect(origin, { connect: "error", reason: "state" });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/settings/channels`);
  }

  /* 토큰 암호문을 쓰는 조회·저장은 **service_role 로** 한다(마이그레이션 0085, 2026-09-07 감사).
     0085 가 토큰 암호문 컬럼을 authenticated 의 SELECT/INSERT/UPDATE 대상에서 빼기 때문에,
     세션 클라이언트로는 이 저장이 더 이상 통하지 않는다.
     행 범위는 아래 `user_id: user.id` 와 `.eq("user_id", user.id)` 가 정한다. */
  const store = createAdminClient() ?? supabase;
  /* 여기서만 세션 클라이언트 폴백을 남긴다 — 이 경로는 **본인이 자기 토큰을 쓰는** 자리라
     폴백이 열어 주는 것이 없다(RLS 가 본인 행으로 묶는다). 읽기 경로(lib/data/live.ts·ads.ts)는
     반대다: 거기서의 폴백은 «팀원이 소유자 암호문을 읽는» 바로 그 조회를 되살리므로 닫아 두었다. */

  const config = getMetaAdsOAuthConfig();
  if (!config) {
    return settingsRedirect(origin, { connect: "error", reason: "unconfigured" });
  }
  if (!isTokenEncryptionConfigured()) {
    console.error(`[${TAG}] TOKEN_ENCRYPTION_KEY 미설정 — 연동 중단`);
    return settingsRedirect(origin, { connect: "error", reason: "no_encryption_key" });
  }

  /* 단계를 남긴다 — 전부 «오류»로 뭉개면 원인을 좁힐 수 없다(2026-08-31 인스타에서 배운 것) */
  let stage: "code" | "longlived" | "me" = "code";
  const redirectUri = resolveAdsCallbackUri(request);

  try {
    console.info(`[${TAG}] 토큰 교환 시작 redirect_uri=${redirectUri}`);
    const shortLived = await exchangeAdsCodeForToken({ code, redirectUri, config });
    stage = "longlived";
    const longLived = await exchangeAdsForLongLivedToken({
      shortLivedToken: shortLived.accessToken,
      config,
    });
    stage = "me";
    const me = await fetchFbMe(longLived.accessToken);

    const cipher = encryptToken(longLived.accessToken);
    if (!cipher) {
      return settingsRedirect(origin, { connect: "error", reason: "encrypt_failed" });
    }

    /* 만료 시각. expires_in 이 안 오는 경우가 있어 60일로 가정한다 —
       ⚠️ 이 토큰은 **갱신이 없다.** 만료되면 재연동뿐이라 화면이 이 날짜를 보여준다. */
    const expiresAt = new Date(
      Date.now() + (longLived.expiresInSeconds ?? 60 * 24 * 60 * 60) * 1000,
    ).toISOString();

    const granted = await fetchGrantedFbScopes(longLived.accessToken);

    const connRow: Record<string, unknown> = {
      user_id: user.id,
      fb_user_id: me.id,
      fb_name: me.name,
      access_token_cipher: cipher,
      token_expires_at: expiresAt,
      connected: true,
      /* null 은 «확인 불가»다 — «권한 없음»과 다르므로 컬럼을 아예 안 건드린다(0075 규칙) */
      ...(granted && granted.length > 0 ? { granted_scopes: granted } : {}),
    };

    /* 재연동이면 갱신. 사용자당 연결은 하나라 unique(user_id) 로 upsert 한다(0077).
       다른 페이스북 계정으로 다시 연동하면 같은 행의 fb_user_id 가 바뀐다 —
       행이 둘로 늘면 화면과 해제가 서로 다른 행을 보게 된다.
       ⚠️ .select() 없이는 RLS 로 0행이 되어도 오류가 안 난다 — 반드시 결과 행을 확인한다. */
    let conn = await store
      .from("meta_ad_connections")
      .upsert(connRow, { onConflict: "user_id" })
      .select("id");
    if (conn.error && isMissingColumnError(conn.error, /granted_scopes/i)) {
      const { granted_scopes: _s, ...withoutScopes } = connRow;
      void _s;
      conn = await store
        .from("meta_ad_connections")
        .upsert(withoutScopes, { onConflict: "user_id" })
        .select("id");
    }
    if (conn.error) {
      console.error(`[${TAG}] 연동 저장 실패:`, conn.error.message);
      /* 0077 미적용이면 표가 통째로 없다 — «저장 실패»가 아니라 운영자가 할 일이 있다는 뜻이다.
         이걸 «다시 시도해 주세요»로 말하면 사용자가 될 때까지 재시도하게 된다. */
      return settingsRedirect(origin, {
        connect: "error",
        reason: isMissingTableError(conn.error) ? "migration_needed" : "save_failed",
      });
    }
    if (!conn.data || conn.data.length === 0) {
      console.error(`[${TAG}] 연동 저장 0행 — RLS 로 막혔을 가능성(user_id 불일치)`);
      return settingsRedirect(origin, { connect: "error", reason: "save_failed" });
    }
    const connectionId = (conn.data[0] as { id: string }).id;

    /* 광고 계정 목록. 실패(null)와 «접근 가능한 계정이 0개»(빈 배열)는 다르다 —
       0개는 사용자가 광고 계정 권한을 안 준 것이고, 화면 안내가 달라야 한다.
       토큰은 이미 저장했으므로 어느 쪽이든 연동 자체는 되돌리지 않는다. */
    const accounts = await fetchAdAccounts(longLived.accessToken);
    if (accounts === null) {
      return settingsRedirect(origin, { connect: "warn", reason: "ads_accounts_unavailable" });
    }
    if (accounts.length === 0) {
      return settingsRedirect(origin, { connect: "warn", reason: "no_ad_account" });
    }

    /* 기존에 고른 기본 계정을 존중한다 — 재연동 때마다 첫 번째로 되돌리면
       계정이 여럿인 대행사에서 «내가 보던 계정이 바뀌었다»가 된다. */
    const { data: prevDefault } = await store
      .from("meta_ad_accounts")
      .select("ad_account_id")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    const prevDefaultId = (prevDefault as { ad_account_id?: string } | null)?.ad_account_id ?? null;
    const keepPrev = prevDefaultId !== null && accounts.some((a) => a.accountId === prevDefaultId);
    const defaultId = keepPrev ? prevDefaultId : accounts[0].accountId;

    const acctRows = accounts.map((a) => ({
      connection_id: connectionId,
      user_id: user.id,
      ad_account_id: a.accountId,
      account_name: a.name,
      currency: a.currency,
      timezone_name: a.timezoneName,
      account_status: a.accountStatus,
      is_default: a.accountId === defaultId,
    }));

    /* 계정 행도 store(service_role)로 쓴다 — 0088 이 meta_ad_accounts 의 INSERT/UPDATE 를
       사용자에게서 회수하기 때문이다. 회수하는 이유: 사용자가 PostgREST 로 ad_account_id 를
       임의 문자열로 바꾸거나, 자기 행을 **남의 connection_id** 에 매달 수 있었다(2026-09-08 감사, High).
       행 범위는 위 user_id·connection_id 가 정한다. */
    const acctWrite = await store
      .from("meta_ad_accounts")
      .upsert(acctRows, { onConflict: "user_id,ad_account_id" })
      .select("id");
    if (acctWrite.error) {
      console.error(`[${TAG}] 광고 계정 저장 실패:`, acctWrite.error.message);
      return settingsRedirect(origin, { connect: "warn", reason: "ads_accounts_unavailable" });
    }

    /* 이번에 안 온 계정은 접근 권한이 사라진 것이다 — 남겨 두면 화면에서 계속 조회에 실패한다.
       다른 연결(다른 FB 계정)로 붙은 행은 건드리지 않기 위해 connection_id 로 한정한다. */
    const keep = accounts.map((a) => a.accountId);
    const { error: pruneErr } = await store
      .from("meta_ad_accounts")
      .delete()
      .eq("user_id", user.id)
      .eq("connection_id", connectionId)
      .not("ad_account_id", "in", `(${keep.map((id) => `"${id}"`).join(",")})`);
    if (pruneErr) console.error(`[${TAG}] 사라진 계정 정리 실패(연동은 유지):`, pruneErr.message);

    return settingsRedirect(origin, {
      connect: "success",
      handle: `광고 계정 ${accounts.length}개`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${TAG}] 콜백 처리 실패 stage=${stage}:`, msg);
    /* ⚠️ 인스타의 account_info 를 재사용하지 않는다 — 그 문구는 «비즈니스 계정인지 확인하세요» 라서
       광고 연동에서는 엉뚱한 곳을 보게 만든다. 화면 문구가 다르면 이유 코드도 달라야 한다. */
    const reason =
      stage === "me" ? "ads_profile" : stage === "longlived" ? "exchange_longlived" : "exchange_code";
    /* ⚠️ detail 은 **운영자 요청일 때만**. 예전엔 모든 고객의 주소창·방문 기록에 인가 서버 원문이 실려 나갔고,
       화면에서 가리는 것만으로는 그게 안 지워졌다(2026-09-06 적발). 원문은 위 로그와 Sentry 에 남는다. */
    const forOwner = isOwnerEmail(user.email);
    return settingsRedirect(origin, {
      connect: "error",
      reason,
      ...(forOwner ? { detail: `${msg} | redirect_uri=${redirectUri}`.slice(0, 400) } : {}),
    });
  }
}
