import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChannelProvider } from "@/components/layout/channel-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AgentPanel } from "@/components/layout/agent-panel";
import { MobileTabbar } from "@/components/layout/mobile-tabbar";
import { OpeningNotice } from "@/components/layout/opening-notice";
import { isDemoMode } from "@/lib/supabase/config";
import { getAuthUser } from "@/lib/supabase/server";
import { IS_SAMPLE_DATA } from "@/lib/data";
import { getNotifications } from "@/lib/data/internal";

/* 로그인 후 영역 전체 — 검색 노출 금지 (PART 13.1) */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 인증 가드 — 판단은 반드시 getUser() (getSession() 금지).
  // 데모 모드(키 미설정 또는 NEXT_PUBLIC_DEMO_MODE)면 가드 없이 통과.
  // Supabase가 일시정지/한도초과로 죽어 getUser()가 예외를 던지면, 로그인으로 내몰지 않고
  // fail-open으로 통과시킨다 — 백엔드 장애가 사이트 전체를 막다른 길로 만들지 않도록.
  if (!isDemoMode()) {
    try {
      // getAuthUser는 요청당 1회 메모이즈 — 이 가드가 왕복을 내고 페이지 조회 함수들은 재사용
      const user = await getAuthUser();
      if (!user) redirect("/login");
    } catch (error) {
      // Next 내부 제어 신호는 그대로 흘려보낸다:
      // - NEXT_REDIRECT: redirect()의 정상 동작
      // - DYNAMIC_SERVER_USAGE: cookies() 사용 라우트를 빌드가 동적으로 표시하는 신호
      //   (삼키면 인증 영역이 정적 페이지로 구워져 가드가 무력화된다)
      const digest =
        error && typeof error === "object" && "digest" in error
          ? String((error as { digest?: string }).digest)
          : "";
      if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("DYNAMIC_SERVER_USAGE")) {
        throw error;
      }
      // 그 외(네트워크/프로젝트 다운)는 통과 — 데모 모드로 열람 허용
      console.warn("[auth] Supabase 접근 실패, 데모 모드로 통과합니다:", error);
    }
  }

  /* 상단바 벨의 미읽음 수 — /notifications 화면과 **같은 조회**를 쓴다.
     예전엔 상단바가 정적 목데이터를 세고 있어서 실제 모드에서는 영원히 0 이었고,
     데모에서는 다 읽은 뒤에도 숫자가 그대로였다. null 은 조회 실패라 배지를 띄우지 않는다
     (없는 것과 모르는 것을 구분한다 — lib/data/internal.ts 규칙). */
  const notis = await getNotifications();
  const unread = notis ? notis.filter((n) => !n.read).length : 0;

  return (
    <ChannelProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar unread={unread} />
          {IS_SAMPLE_DATA ? (
            /* 좌측 정렬 — text-center 라 1632px 띠 한가운데 한 줄이 떠 있었고,
               그게 모든 페이지 최상단에서 매번 반복됐다. */
            <p className="border-b border-line bg-plate px-4 py-1.5 text-[12px] text-fg-sub md:px-6">
              지금 보이는 수치는 <span className="font-semibold text-warning">예시 데이터</span>입니다 —
              채널 연동이 완료되면 실제 데이터로 교체됩니다
            </p>
          ) : null}
          {/* 우하단 AI 에이전트 FAB(52px, z-40)이 페이지 마지막 줄 위에 겹쳐, 1440×950 에서
              /settings 의 「문의하기」 링크가 통째로 가려졌다 — 눌렀더니 에이전트 패널이 열렸다(실측).
              데스크톱에서도 FAB 높이만큼 바닥을 비운다(모바일 pb-24 는 하단 탭바 몫이라 그대로). */}
          <main className="flex-1 px-4 py-5 pb-24 md:px-6 md:pb-24">{children}</main>
        </div>
      </div>
      <AgentPanel />
      <MobileTabbar />
      <OpeningNotice />
    </ChannelProvider>
  );
}
