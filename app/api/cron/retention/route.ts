import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";

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

  const results: Record<string, string> = {};
  for (const rule of RULES) {
    const cutoff = new Date(Date.now() - rule.days * DAY).toISOString();
    /* count 를 요청해 «몇 건을 파기했나»를 남긴다 — 파기는 되돌릴 수 없어서 기록이 곧 증빙이다 */
    const { error, count } = await admin
      .from(rule.table)
      .delete({ count: "exact" })
      .lt(rule.column, cutoff);
    if (error) {
      /* 표가 아직 없는 DB(마이그레이션 미적용)는 실패가 아니다 — 건너뛴다 */
      const missing = error.code === "42P01" || new RegExp(rule.table, "i").test(error.message);
      results[rule.table] = missing ? "skipped" : `error: ${error.message}`;
      if (!missing) console.error(`[cron:retention] ${rule.table} 파기 실패:`, error.message);
      continue;
    }
    results[rule.table] = `deleted ${count ?? 0}`;
  }

  return NextResponse.json({ ok: true, results });
}
