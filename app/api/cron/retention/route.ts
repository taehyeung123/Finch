import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { isMissingTableError } from "@/lib/supabase/errors";

/**
 * 보존기간 파기 크론 (매일 19:20 UTC = 04:20 KST — 다른 배치와 겹치지 않는 시간대).
 *
 * 왜 생겼나 (2026-09-07 보안 감사): 개인정보처리방침이 확언한 파기가 **코드에 없었다.**
 * 방침은 지켜지는 규칙이어야지 문서에만 있는 문장이면 안 된다. 세 표를 다룬다:
 *
 *  · webhook_events   — 90일. 방침(옛 5-③, 현 제4조) 의 «탈퇴와 동시에 파기»는 0087 의 user_id cascade 가 맡고,
 *                       여기는 «목적 달성 후 파기»(0002 의 미이행 TODO)를 맡는다.
 *                       이 표는 읽는 코드가 한 줄도 없어(insert 1곳뿐) 무한히 쌓이기만 했다.
 *  · link_leads       — 24개월. 방문자(제3자)의 이름·이메일·전화가 무기한 쌓이던 표다.
 *  · link_unlock_attempts — 1일. 시도 제한 창은 10분이라 그 이상 남길 이유가 없다.
 *
 * 2026-09-12 추가(방침 정식본 제4조 «보유 기간» 표 — lib/legal/documents.ts). 넷 다 기한 없이 쌓이던 표다:
 *  · link_views / link_clicks — 방문·클릭 기록 1년. 방문자 구분값(해시)·국가·도시가 든 표라 무기한일 이유가 없다.
 *  · dm_sends               — 자동 DM 발송 기록 1년(중복 발송 방지는 24시간 창이라 1년이면 넉넉하다).
 *  · page_reports           — 페이지 신고 1년(신고자 연락처가 선택으로 들어 있다).
 *  · data_deletion_requests — 외부 플랫폼 삭제 요청 기록 1년(확인 코드 조회 페이지가 이 기간 동안 답한다).
 *  서비스 시작(2026-07)부터 1년이 안 됐으므로 이 규칙들의 첫 실제 삭제는 2027-07 이후다 — 넣는 즉시 지워지는 행은 없다.
 *  수신거부 기록(commenter_consent)은 넣지 않는다 — 방침상 «회원 탈퇴 시까지»(수신거부 의사를 계속 지키기 위해)다.
 *
 * 실패는 표별로 격리한다 — 하나가 실패해도 나머지는 파기한다. 파기는 «다음에 다시 하면 되는» 일이라
 * 부분 실패로 전체를 멈추는 것이 더 나쁘다.
 *
 * 2026-09-12 추가 — 메타 삭제 요청의 «남은 정보 10일 안 삭제»(방침 제9조①4) 알림:
 *  콜백은 연결·토큰만 바로 지우고, 그 채널의 남은 정보(자동 DM 규칙·발송 기록·광고 변경 기록·알림 등)의 주인을
 *  data_deletion_followups(0095)에 적는다. 그 삭제는 아직 사람이 한다(docs/LEGAL_REVIEW_2026-09.md 13절 4번).
 *  아무도 표를 보지 않으면 11일째 방침 위반이 되므로, 행이 남아 있는 동안 **매일** console.error 로 올린다(Sentry 알림).
 *  여기서 자동으로 지우지 않는 이유: «그 채널 관련» 알림·발행 식별값은 채널 칸이 없어 기계적으로 가를 수 없고,
 *  되돌릴 수 없는 삭제를 운영 DB 드라이런 없이 크론에 넣지 않는다(9절 1번 자동화는 드라이런 뒤).
 */
export const runtime = "nodejs";
/* 전수 삭제가 아니라 시간 조건 삭제라 짧지만, 첫 실행은 밀린 양이 많을 수 있다 */
export const maxDuration = 120;

const DAY = 86_400_000;

/** 표 → 보존기간(일)·시간 컬럼. 늘리려면 방침(lib/legal/documents.ts)을 **먼저** 고친다. */
const RULES: ReadonlyArray<{ table: string; column: string; days: number }> = [
  { table: "webhook_events", column: "received_at", days: 90 },
  { table: "link_leads", column: "created_at", days: 730 },
  { table: "link_unlock_attempts", column: "created_at", days: 1 },
  { table: "link_views", column: "created_at", days: 365 },
  { table: "link_clicks", column: "created_at", days: 365 },
  { table: "dm_sends", column: "created_at", days: 365 },
  { table: "page_reports", column: "created_at", days: 365 },
  { table: "data_deletion_requests", column: "created_at", days: 365 },
];

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }

  /* 후속 삭제가 아직 남은 요청은 1년이 지나도 요청 기록을 지우지 않는다 — 지우면 대기 행이 cascade 로 함께 사라져
     «남은 정보를 안 지웠다»는 사실과 매일 알림이 조용히 없어진다(2026-09-12 소넷 점검). 조회 실패면 이번엔 요청 기록 파기를 건너뛴다. */
  const keepCodes = await pendingFollowupCodes(admin);

  const results: Record<string, string> = {};
  for (const rule of RULES) {
    const cutoff = new Date(Date.now() - rule.days * DAY).toISOString();
    if (rule.table === "data_deletion_requests" && keepCodes === null) {
      results[rule.table] = "skipped (follow-up lookup failed)";
      continue;
    }
    /* count 를 요청해 «몇 건을 파기했나»를 남긴다 — 파기는 되돌릴 수 없어서 기록이 곧 증빙이다 */
    let del = admin.from(rule.table).delete({ count: "exact" }).lt(rule.column, cutoff);
    if (rule.table === "data_deletion_requests" && keepCodes && keepCodes.length > 0) {
      /* 확인 코드는 무작위 16자 hex(콜백의 randomUUID) — 따옴표로 감싸 PostgREST in 목록에 넣는다 */
      del = del.not("confirmation_code", "in", `(${keepCodes.map((c) => `"${c.replace(/"/g, "")}"`).join(",")})`);
    }
    const { error, count } = await del;
    if (error) {
      /* 표가 아직 없는 DB(마이그레이션 미적용)는 실패가 아니다 — 건너뛴다 */
      const missing = error.code === "42P01" || new RegExp(rule.table, "i").test(error.message);
      results[rule.table] = missing ? "skipped" : `error: ${error.message}`;
      if (!missing) console.error(`[cron:retention] ${rule.table} 파기 실패:`, error.message);
      continue;
    }
    results[rule.table] = `deleted ${count ?? 0}`;
  }

  results.deletion_followups = await remindDeletionFollowups(admin);

  return NextResponse.json({ ok: true, results });
}

/** 후속 삭제가 남은 확인 코드들 — 표가 없으면(0095 미적용) 빈 배열(지킬 대기 행이 없다), 조회 실패면 null */
async function pendingFollowupCodes(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<string[] | null> {
  const { data, error } = await admin.from("data_deletion_followups").select("confirmation_code").limit(1000);
  if (error) {
    if (isMissingTableError(error)) return [];
    console.error("[cron:retention] 후속 삭제 대기 코드 조회 실패 — 삭제 요청 기록 파기를 이번엔 건너뛴다:", error.message);
    return null;
  }
  return [...new Set(((data ?? []) as Array<{ confirmation_code: string }>).map((r) => r.confirmation_code))];
}

/** 남은 정보 후속 삭제 대기 알림 — 위 머리말 «2026-09-12 추가». 반환은 결과 요약 문자열 */
async function remindDeletionFollowups(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<string> {
  const { data, error } = await admin
    .from("data_deletion_followups")
    .select("confirmation_code, channel, requested_at, found_by")
    .order("requested_at", { ascending: true })
    .limit(50);
  if (error) {
    /* 0095 미적용 — 대기 표가 없다. 콜백이 그 사실을 요청마다 로그로 남기므로 여기서는 건너뛴다 */
    if (isMissingTableError(error)) return "skipped";
    console.error("[cron:retention] 삭제 요청 후속 삭제 대기 조회 실패:", error.message);
    return `error: ${error.message}`;
  }
  const rows = (data ?? []) as Array<{ confirmation_code: string; channel: string; requested_at: string; found_by: string }>;
  if (rows.length === 0) return "pending 0";

  const now = Date.now();
  const lines = rows.map((r) => {
    const age = Math.floor((now - Date.parse(r.requested_at)) / DAY);
    const due = new Date(Date.parse(r.requested_at) + 10 * DAY).toISOString().slice(0, 10);
    return `${r.confirmation_code}(${r.channel}, D+${age}, 기한 ${due}${r.found_by === "publish_history" ? ", 이미 해제된 계정" : ""})`;
  });
  const overdue = rows.filter((r) => now - Date.parse(r.requested_at) >= 10 * DAY).length;
  /* 확인 코드만 적는다 — 회원 id 는 SQL Editor 에서 코드로 찾는다(로그에 사람을 잇는 값을 늘리지 않는다) */
  console.error(
    `[cron:retention] 메타 삭제 요청 «남은 정보» 후속 삭제 대기 ${rows.length}건${overdue > 0 ? ` — 기한 지남 ${overdue}건` : ""}. ` +
      `요청 7일 뒤~10일 안에 처리(docs/LEGAL_REVIEW_2026-09.md 13절 4번): ${lines.join(" · ")}`,
  );
  return `pending ${rows.length}${overdue > 0 ? ` (overdue ${overdue})` : ""}`;
}
