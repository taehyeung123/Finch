import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChannelProvider } from "@/components/layout/channel-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AgentPanel } from "@/components/layout/agent-panel";
import { MobileTabbar } from "@/components/layout/mobile-tabbar";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { IS_SAMPLE_DATA } from "@/lib/data";

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
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

  return (
    <ChannelProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          {IS_SAMPLE_DATA ? (
            <p className="border-b border-line bg-overlay px-4 py-2 text-center text-xs text-fg-sub md:px-6">
              지금 보이는 수치는 <span className="font-semibold text-warning">예시 데이터</span>입니다 —
              채널 연동이 완료되면 실제 데이터로 교체됩니다
            </p>
          ) : null}
          <main className="flex-1 px-4 py-6 pb-24 md:px-6 md:pb-10">{children}</main>
        </div>
      </div>
      <AgentPanel />
      <MobileTabbar />
    </ChannelProvider>
  );
}
