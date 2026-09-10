import { getNotifications } from "@/lib/data/internal";

/*
  상단바 벨의 미읽음 배지 — 레이아웃에서 떼어 낸 서버 컴포넌트.

  예전엔 (app)/layout.tsx 가 인증 → 동의 → **알림 100건 조회**를 직렬로 await 한 뒤에야 화면을 내려보냈다.
  알림 수는 이 배지 하나에만 쓰이는데, 모든 화면 이동이 그 조회를 기다렸다(2026-09-10 실측: 레이아웃이 끝나기 전엔
  loading.tsx 도 못 뜬다 — Next 문서 layout.md «Interaction with loading.js»).
  이제 레이아웃은 인증·동의만 확인하고 끝나고, 이 배지는 <Suspense fallback={null}> 안에서 뒤따라 채워진다.

  /notifications 화면과 **같은 조회**(lib/data/internal.ts)를 쓴다 — 두 화면이 다른 소스를 보면 벨이 0 에 멈춘다(과거 실측).
  null 은 조회 실패라 배지를 띄우지 않는다(없는 것과 모르는 것을 구분한다).
*/
export async function TopbarUnread() {
  const notis = await getNotifications();
  const unread = notis ? notis.filter((n) => !n.read).length : 0;
  if (unread <= 0) return null;
  return (
    <span
      className="absolute right-0.5 top-0.5 min-w-4 rounded-chip bg-primary px-1 text-[11px] font-bold leading-4 text-on-primary tnum"
      aria-label={`읽지 않은 알림 ${unread}건`}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}
