import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/supabase/errors";
import { BUSINESS } from "./business";
import { sendLegalNoticeEmail } from "@/lib/email/resend";
import { koDate, todayKst } from "./versions";

/*
  동의·철회 이력(0095 user_consent_events) + 광고성 정보 수신 동의 처리 결과 통지.

  ① 이력: user_consents(0079)는 최신 상태 1행이라 재동의·철회 때 옛 값을 덮어쓴다. 증빙이 사라지지 않게 한 줄씩 **추가**한다.
     쓰기는 서버(service_role)만 — 표에 insert 정책이 없다. 기록 실패는 동의 저장을 막지 않는다(증빙 보조 수단이다).
     다만 «없으면 조용히» 넘기지 않고 로그를 남긴다 — 0095 미적용이면 그 사실이 로그에 보여야 한다.
     ⚠️ 이 파일의 함수는 **던지지 않는다.** 동의 저장(user_consents)이 이미 끝난 뒤에 불리므로, 여기서 던지면
        저장은 됐는데 화면은 오류가 되고(재시도하면 재동의 경로로 빠진다) — 0095 가 없거나 망이 끊긴 순간
        동의 화면이 사람을 붙잡는 셈이 된다. «모름 → 통과» 규칙(lib/legal/consent.ts)과 같은 쪽으로 실패한다.
  ② 통지: 정보통신망법 §50⑦ — 수신 동의·철회 의사를 받은 날부터 14일 안에 전송자 명칭, 동의·철회 사실과 날짜, 처리 결과를 알린다.
     이메일로 보낸다(방침 제19조①). 메일 주소가 없는 계정(카카오 이메일 미동의)은 이메일 광고를 받을 수도 없으니 건너뛴다.
     발송 실패는 회원 식별번호(uuid)와 함께 로그로 남긴다 — 14일 안에 다시 보낼 수 있게(docs/LEGAL_REVIEW_2026-09.md 6절 6번).
     이메일 원문은 로그에 넣지 않는다.
*/

export type ConsentEvent = {
  doc: "over14" | "terms" | "privacy" | "marketing_email";
  version?: string | null;
  action: "agree" | "acknowledge" | "withdraw";
  source: "signup" | "reconsent" | "settings";
};

export async function recordConsentEvents(userId: string, events: ConsentEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const admin = createAdminClient();
    if (!admin) {
      console.error("[consent-events] service role 키 미설정 — 동의 이력을 남기지 못했다");
      return;
    }
    const { error } = await admin.from("user_consent_events").insert(
      events.map((e) => ({ user_id: userId, doc: e.doc, version: e.version ?? null, action: e.action, source: e.source })),
    );
    if (error) {
      if (isMissingTableError(error)) {
        console.error("[consent-events] user_consent_events 표 없음 — 0095 마이그레이션 적용 필요(동의 저장은 됐다)");
        return;
      }
      console.error("[consent-events] 동의 이력 기록 실패:", error.message);
    }
  } catch (e) {
    console.error("[consent-events] 동의 이력 기록 실패(예외):", e);
  }
}

/**
 * 최근 광고성 정보 수신 «동의» 이력 수 — 알림 설정 스위치의 남용 제한용(동의마다 법정 메일 1통이 나간다).
 * null = 셀 수 없음(0095 미적용·조회 실패). 호출하는 쪽은 null 이면 제한하지 않는다 — 철회·동의가 막히는 것이
 * 메일이 몇 통 더 나가는 것보다 나쁘다(철회는 언제든 쉬워야 한다, 정보통신망법 §50). 대신 로그를 남긴다.
 */
export async function countRecentMarketingAgrees(userId: string, sinceMs: number): Promise<number | null> {
  try {
    const admin = createAdminClient();
    if (!admin) return null;
    const { count, error } = await admin
      .from("user_consent_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("doc", "marketing_email")
      .eq("action", "agree")
      .gte("created_at", new Date(Date.now() - sinceMs).toISOString());
    if (error) {
      console.error(
        isMissingTableError(error)
          ? "[consent-events] user_consent_events 표 없음 — 광고성 정보 동의 남용 제한이 꺼져 있다(0095 적용 필요)"
          : `[consent-events] 광고성 정보 동의 이력 조회 실패 — 남용 제한을 건너뛴다: ${error.message}`,
      );
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[consent-events] 광고성 정보 동의 이력 조회 실패(예외):", e);
    return null;
  }
}

/** 광고성 정보(이메일) 수신 동의·철회 처리 결과 통지 — 정보통신망법 §50⑦ */
export async function notifyMarketingConsentResult(
  userId: string,
  email: string | null | undefined,
  granted: boolean,
  at: Date = new Date(),
): Promise<void> {
  const to = (email ?? "").trim();
  if (!to) return;
  const sender = `${BUSINESS.company}(${BUSINESS.serviceName})`;
  const day = koDate(todayKst(at));
  const title = granted ? "광고성 정보 수신 동의 처리 결과" : "광고성 정보 수신 동의 철회 처리 결과";
  const body = granted
    ? `전송자: ${sender}. ${day}에 광고성 정보(이메일) 수신에 동의하셨고, 동의가 정상 처리되었습니다. 동의는 계정 및 설정 > 알림 설정에서 언제든 철회할 수 있습니다.`
    : `전송자: ${sender}. ${day}에 광고성 정보(이메일) 수신 동의를 철회하셨고, 철회가 정상 처리되었습니다. 앞으로 광고성 정보를 보내지 않습니다.`;
  const footer = "이 메일은 광고성 정보 수신 동의 상태가 바뀌어 정보통신망법에 따라 보내 드리는 안내입니다. 광고가 아니며, 알림 설정과 관계없이 발송됩니다.";
  let ok = false;
  try {
    ok = await sendLegalNoticeEmail(to, title, body, footer, { label: "알림 설정 열기", url: `${BUSINESS.siteUrl}/settings/notifications` });
  } catch (e) {
    console.error("[consent-events] 처리 결과 메일 발송 예외:", e);
  }
  if (!ok) {
    /* 다시 보낼 대상을 찾을 수 있게 회원 식별번호와 무엇·언제를 남긴다(이메일 원문은 남기지 않는다).
       재발송: auth.users 에서 이 id 의 이메일로 같은 문안을 보낸다 — docs/LEGAL_REVIEW_2026-09.md 13절 6번 */
    console.error(
      `[consent-events] 광고성 정보 ${granted ? "동의" : "철회"} 처리 결과 메일 발송 실패 — 14일 안에 재발송 필요 (user=${userId}, 의사표시일=${todayKst(at)})`,
    );
  }
}
