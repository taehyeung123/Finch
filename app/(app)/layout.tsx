import type { Metadata } from "next";
import { ChannelProvider } from "@/components/layout/channel-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AgentPanel } from "@/components/layout/agent-panel";
import { MobileTabbar } from "@/components/layout/mobile-tabbar";

/* 로그인 후 영역 전체 — 검색 노출 금지 (PART 13.1) */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
