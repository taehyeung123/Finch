import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChannelProvider } from "@/components/layout/channel-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AgentPanel } from "@/components/layout/agent-panel";
import { MobileTabbar } from "@/components/layout/mobile-tabbar";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/* 로그인 후 영역 전체 — 검색 노출 금지 (PART 13.1) */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Supabase 설정 시에만 인증 가드 — 판단은 반드시 getUser() (getSession() 금지).
  // 미설정이면 데모 모드로 가드 없이 통과.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
  }

  return (
    <ChannelProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 py-6 pb-24 md:px-6 md:pb-10">{children}</main>
        </div>
      </div>
      <AgentPanel />
      <MobileTabbar />
    </ChannelProvider>
  );
}
