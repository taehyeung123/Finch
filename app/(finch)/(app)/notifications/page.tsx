import { getNotifications } from "@/lib/data/internal";
import { LoadFailed } from "@/components/ui/load-failed";
import { NotificationsClient } from "./_components/notifications-client";

/*
  알림 (PART 4.12) — 서버에서 실 알림을 조회해 클라이언트 목록에 전달.
  데모 모드는 목데이터, 실 모드는 로그인 사용자의 notifications 행(없으면 빈 상태).

  ⚠️ null 은 «알림 없음»이 아니라 «조회 실패»다 — 빈 목록으로 그리면
  안 읽은 알림이 있는데도 「알림이 없습니다」가 뜬다(lib/data/internal.ts 규칙).
*/
export default async function NotificationsPage() {
  const initial = await getNotifications();
  if (initial === null) return <LoadFailed title="알림을 불러오지 못했어요" />;
  return <NotificationsClient initial={initial} />;
}
