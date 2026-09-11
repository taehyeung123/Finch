/* 권한 대조 모듈(granted-scopes → 인스타·스레드 OAuth 설정)을 끌어온다 — 서버 전용 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REQUIRED_SCOPE, checkScope } from "@/lib/meta/granted-scopes";
import { channelLabel, isMissingColumnError, type PublishChannel } from "@/lib/publish-rules";

/*
  발행 관문 — «발행 약속»(예약·지금 발행)을 받기 전에 보는 것 한 벌 (2026-09-11 publish/actions.ts 에서 분리).

  부르는 곳: 발행 화면의 서버 액션(app/(finch)/(app)/publish/actions.ts)과 스튜디오 카드뉴스 예약 라우트
  (app/api/studio/schedule/route.ts). 예전엔 스튜디오 라우트가 «연동 행이 있는가»만 봐서, 발행 권한 없이 연결한
  계정의 예약을 받아 두고 크론이 돌 때 권한 오류로 실패했다 — 발행 화면은 막는 것을 스튜디오는 통과시켰다.
  두 곳이 같은 함수를 부르면 다시 갈라지지 않는다.
*/

/**
 * 연동 계정 + 부여된 스코프 조회. 0075 미적용 DB 폴백 포함.
 *
 * ⚠️ granted_scopes 컬럼이 없는 DB 에서 그냥 select 하면 **예약 자체가 깨진다** —
 * 지금 잘 돌아가는 기능을 마이그레이션 적용 전까지 죽이는 셈이다. 컬럼 없음이면 없이 다시 조회한다.
 * 반환의 scopes=null 은 «확인 불가» 다(«권한 없음» 이 아니다).
 */
async function loadConnectedAccount(
  supabase: SupabaseClient,
  userId: string,
  channel: PublishChannel,
): Promise<{ ok: true; found: boolean; scopes: string[] | null } | { ok: false }> {
  const base = () =>
    supabase
      .from("connected_accounts")
      .select("id, granted_scopes")
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("connected", true)
      .limit(1)
      .maybeSingle();

  const res = await base();
  if (isMissingColumnError(res.error, /granted_scopes/i)) {
    const fallback = await supabase
      .from("connected_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("connected", true)
      .limit(1)
      .maybeSingle();
    if (fallback.error) {
      console.error("[publish] 연동 확인 실패:", fallback.error.message);
      return { ok: false };
    }
    return { ok: true, found: !!fallback.data, scopes: null };
  }
  if (res.error) {
    /* 조회 실패를 «연동 없음»으로 읽으면 멀쩡히 연동한 사람에게 연동하라고 말한다 —
       이 저장소가 반복해 밟은 «실패는 없음이 아니다» 함정이다. */
    console.error("[publish] 연동 확인 실패:", res.error.message);
    return { ok: false };
  }
  const row = res.data as { granted_scopes?: string[] | null } | null;
  return { ok: true, found: !!row, scopes: row?.granted_scopes ?? null };
}

export type PublishGateResult =
  | { ok: true }
  /** reason — 라우트가 응답 코드를 가르는 데 쓴다(lookup_failed 는 우리 쪽 문제라 5xx) */
  | { ok: false; error: string; reason: "lookup_failed" | "not_connected" | "scope_missing" };

/**
 * 발행 관문 — 예약이든 지금 발행이든 «발행 약속»을 받기 전에 같은 것을 본다.
 * ⚠️ user_id 로 반드시 좁힌다. connected_accounts 에는 "team members read" 정책이 있어 팀원이 **소유자의**
 * 연동 행을 읽는다 — 안 좁히면 자기 계정엔 연동이 없는데 관문을 통과하고, 발행은 user_id 로 토큰을 찾으므로
 * 반드시 실패한다.
 */
export async function publishGate(
  supabase: SupabaseClient,
  userId: string,
  channel: PublishChannel,
): Promise<PublishGateResult> {
  const acc = await loadConnectedAccount(supabase, userId, channel);
  if (!acc.ok) return { ok: false, error: "잠시 후 다시 시도해 주세요.", reason: "lookup_failed" };
  if (!acc.found) {
    return { ok: false, error: `먼저 설정에서 ${channelLabel(channel)} 계정을 연동해 주세요.`, reason: "not_connected" };
  }
  /* 발행 권한이 **확실히 없으면** 여기서 막는다 — 받아 두면 크론이 돌 때 권한 오류로 실패하고, 그 사이 사용자는
     발행될 거라고 믿는다. 확인 불가(0075 이전 연동)면 통과시킨다 — 모른다고 멀쩡한 예약을 막지 않는다. */
  const scopeCheck = checkScope(
    acc.scopes,
    channel === "threads" ? REQUIRED_SCOPE.threadsPublish : REQUIRED_SCOPE.instagramPublish,
  );
  if (scopeCheck.state === "missing") {
    return {
      ok: false,
      error: `${channelLabel(channel)} 발행 권한이 없어요. 설정에서 다시 연동하면 바로 쓸 수 있어요.`,
      reason: "scope_missing",
    };
  }
  return { ok: true };
}
