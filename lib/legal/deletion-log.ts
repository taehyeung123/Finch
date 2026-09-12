import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError } from "@/lib/publish-rules";
import { isMissingTableError } from "@/lib/supabase/errors";

/**
 * 데이터 삭제 요청 기록 — 세 채널(인스타·스레드·광고)이 같은 규칙을 쓴다.
 *
 * ⚠️ **삭제 실패를 «지울 것이 없었다»로 적지 않는다.**
 * 예전엔 세 라우트 모두 delete 의 error 를 로그로만 흘리고 `deleted_rows: removed?.length ?? 0`
 * 을 사실로 기록했다. 실패하면 data 가 null 이라 0 이 들어가는데, 0 의 뜻은 «남아 있던 정보가 없었다» 다
 * (0076 주석의 정의). 그래서 공개 상태 페이지가 사용자와 **메타 심사관에게**
 * 「저장된 정보가 없었습니다」 라고 확언한다 — 토큰이 그대로 남아 있는데도.
 * 실패는 «없음»이 아니다.
 *
 * 2026-09-12(방침 정식본 제9조①4 «남은 정보도 요청일부터 10일 안에 삭제»): 연결 행은 콜백이 바로 지우므로,
 * 누구의 남은 정보(자동 DM 규칙·발송 기록·광고 변경 기록·알림 등)를 지울지 **여기 적어 두지 않으면 되찾을 길이 없다.**
 * 그래서 요청 한 건에 핀치 회원을 **여럿** 붙일 수 있는 후속 삭제 표(data_deletion_followups, 0095)에 적는다 —
 * 광고는 같은 페이스북 계정을 여러 핀치 계정이 연결할 수 있다(meta_ad_connections 는 사용자당 1행일 뿐 fb_user_id 는 전역 유일이 아니다).
 * 후속 삭제를 마치면 그 행을 지운다(docs/LEGAL_REVIEW_2026-09.md 13절 4번). 행이 남아 있으면 retention 크론이 매일 알린다.
 */

export type DeletionChannel = "instagram" | "threads" | "tiktok" | "meta_ads";

/** 남은 정보의 주인을 어떻게 찾았나 — 연결 행(방금 지움) · 발행 기록(연결은 이미 해제돼 있었음) */
export type FollowupSource = "connection" | "publish_history";

export async function recordDeletionRequest(
  admin: SupabaseClient,
  params: {
    confirmationCode: string;
    channel: DeletionChannel;
    /** 원문 대신 해시로 남긴다 — 삭제 이력에 지운 값을 그대로 두면 앞뒤가 안 맞는다 */
    platformUserId: string;
    deletedRows: number;
    failed: boolean;
    /** 남은 정보를 지울 핀치 회원들(중복 제거 전이어도 된다) — 비었으면 후속 삭제 대상 없음 */
    finchUserIds?: readonly (string | null | undefined)[];
    followupSource?: FollowupSource;
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    confirmation_code: params.confirmationCode,
    channel: params.channel,
    platform_user_hash: createHash("sha256").update(params.platformUserId).digest("hex").slice(0, 32),
    deleted_rows: params.deletedRows,
    status: params.failed ? "failed" : "done",
  };
  const userIds = [...new Set((params.finchUserIds ?? []).filter((v): v is string => typeof v === "string" && v.length > 0))];

  let { error } = await admin.from("data_deletion_requests").insert(row);
  /* 0077 미적용 DB 에는 status 컬럼이 없다 — 기록 자체를 포기하지 않고 나머지는 남긴다.
     다만 실패 사실이 사라지므로, 그때는 로그로 크게 남긴다(계단식 폴백). */
  if (error && isMissingColumnError(error, /status/i)) {
    const { status: _s, ...withoutStatus } = row;
    void _s;
    ({ error } = await admin.from("data_deletion_requests").insert(withoutStatus));
    if (params.failed) {
      console.error(
        `[deletion-log] ${params.channel} 삭제 실패인데 status 컬럼이 없어 기록하지 못했다 — 0077 적용 필요 (code=${params.confirmationCode})`,
      );
    }
  }
  if (error) {
    console.error("[deletion-log] 요청 기록 실패:", error.message);
    /* 요청 행이 없으면 후속 삭제 행도 붙일 수 없다(외래키) — 주인을 잃지 않게 로그에라도 남긴다 */
    if (userIds.length > 0) {
      console.error(
        `[deletion-log] ${params.channel} 삭제 요청의 남은 정보 후속 삭제 대상을 기록하지 못했다 — 10일 안에 수동 삭제 필요 (code=${params.confirmationCode}, users=${userIds.join(",")})`,
      );
    }
    return;
  }

  if (userIds.length === 0) return;
  const { error: fErr } = await admin.from("data_deletion_followups").insert(
    userIds.map((uid) => ({
      confirmation_code: params.confirmationCode,
      user_id: uid,
      channel: params.channel,
      found_by: params.followupSource ?? "connection",
    })),
  );
  if (fErr) {
    /* 0095 미적용이거나 쓰기 실패 — 기록은 포기하지 않되(요청 행은 이미 남았다), 후속 삭제에 쓸 연결을 잃었다는 사실을 크게 남긴다 */
    console.error(
      `[deletion-log] ${params.channel} 삭제 요청의 남은 정보 후속 삭제 대상을 기록하지 못했다${isMissingTableError(fErr) ? " — 0095 적용 필요" : `: ${fErr.message}`} — 10일 안에 수동 삭제 필요 (code=${params.confirmationCode}, users=${userIds.join(",")})`,
    );
  }
}

/**
 * 연결 행이 이미 없을 때(핀치 설정에서 먼저 해제한 뒤 메타 쪽에서 삭제를 요청한 경우) 남은 정보의 주인을 찾는다.
 * 설정의 연결 해제는 연결 행만 지우고 자동 DM 규칙·발행 글·알림은 남긴다 — 그 주인을 못 찾으면 «남은 정보도 10일 안에»를 못 지킨다.
 * 발행 글(scheduled_posts, 0094)은 대상 계정의 플랫폼 id(account_platform_id)를 적어 두므로 거기서 찾는다.
 * 찾지 못해도(발행한 적 없음·0094 미적용) 빈 배열 — 상태 페이지는 «남은 정보가 있으면 알려 달라»고만 말한다(없다고 확언하지 않는다).
 */
export async function findOwnersByPublishHistory(
  admin: SupabaseClient,
  channel: "instagram" | "threads",
  platformUserId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("scheduled_posts")
    .select("user_id")
    .eq("channel", channel)
    .eq("account_platform_id", platformUserId)
    .limit(100);
  if (error) {
    if (!isMissingColumnError(error, /account_platform_id/i)) {
      console.error(`[deletion-log] ${channel} 발행 기록으로 주인 찾기 실패:`, error.message);
    }
    return [];
  }
  return [...new Set(((data ?? []) as Array<{ user_id: string | null }>).map((r) => r.user_id).filter((v): v is string => Boolean(v)))];
}
