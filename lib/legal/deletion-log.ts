import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError } from "@/lib/publish-rules";

/**
 * 데이터 삭제 요청 기록 — 세 채널(인스타·스레드·광고)이 같은 규칙을 쓴다.
 *
 * ⚠️ **삭제 실패를 «지울 것이 없었다»로 적지 않는다.**
 * 예전엔 세 라우트 모두 delete 의 error 를 로그로만 흘리고 `deleted_rows: removed?.length ?? 0`
 * 을 사실로 기록했다. 실패하면 data 가 null 이라 0 이 들어가는데, 0 의 뜻은 «남아 있던 정보가 없었다» 다
 * (0076 주석의 정의). 그래서 공개 상태 페이지가 사용자와 **메타 심사관에게**
 * 「저장된 정보가 없었습니다」 라고 확언한다 — 토큰이 그대로 남아 있는데도.
 * 실패는 «없음»이 아니다.
 */
export async function recordDeletionRequest(
  admin: SupabaseClient,
  params: {
    confirmationCode: string;
    channel: "instagram" | "threads" | "tiktok" | "meta_ads";
    /** 원문 대신 해시로 남긴다 — 삭제 이력에 지운 값을 그대로 두면 앞뒤가 안 맞는다 */
    platformUserId: string;
    deletedRows: number;
    failed: boolean;
    /**
     * 지운 연결의 핀치 회원 id(0095) — 방침 제9조①4 «남은 정보도 요청일부터 10일 안에 삭제»를 지키려면
     * 누구의 남은 정보(자동 DM 규칙·발행 식별값·알림 등)를 지울지 알아야 한다. 연결 행은 이미 지워져서
     * 여기 적어 두지 않으면 되찾을 길이 없다. 후속 삭제를 마치면 비운다(docs/LEGAL_REVIEW_2026-09.md).
     */
    finchUserId?: string | null;
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    confirmation_code: params.confirmationCode,
    channel: params.channel,
    platform_user_hash: createHash("sha256").update(params.platformUserId).digest("hex").slice(0, 32),
    deleted_rows: params.deletedRows,
    status: params.failed ? "failed" : "done",
  };
  if (params.finchUserId) row.user_id = params.finchUserId;

  let { error } = await admin.from("data_deletion_requests").insert(row);
  /* 0095 미적용 DB 에는 user_id 컬럼이 없다 — 떼고 다시 넣는다. 기록 자체는 포기하지 않되,
     후속 삭제(10일)에 쓸 연결을 잃었다는 사실은 크게 남긴다 */
  if (error && "user_id" in row && isMissingColumnError(error, /user_id/i)) {
    console.error(
      `[deletion-log] ${params.channel} 삭제 요청의 회원 연결을 기록하지 못했다 — 0095 적용 필요, 남은 정보 후속 삭제는 수동으로 찾아야 한다 (code=${params.confirmationCode})`,
    );
    delete row.user_id;
    ({ error } = await admin.from("data_deletion_requests").insert(row));
  }
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
  }
}
