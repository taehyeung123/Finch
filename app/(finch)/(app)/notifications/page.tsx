import { getNotifications } from "@/lib/data/internal";
import { NotificationsClient } from "./_components/notifications-client";

/*
  알림 (PART 4.12) — 서버에서 실 알림을 조회해 클라이언트 목록에 전달.
  데모 모드는 목데이터, 실 모드는 로그인 사용자의 notifications 행(없으면 빈 상태).
*/
export default async function NotificationsPage() {
  const initial = await getNotifications();
  return <NotificationsClient initial={initial} />;
}
