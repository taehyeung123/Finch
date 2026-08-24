import type { Metadata } from "next";
import { getPostPerformance } from "@/lib/data/growth";
import { GrowthClient } from "./_components/growth-client";
import { InsightsTabs } from "../tabs";

export const metadata: Metadata = {
  title: "성과 분석 · 내 게시물",
  robots: { index: false, follow: false },
};

/*
  성장 진단 (킬러 기능 "성장 루프" 1단계) — 서버에서 실제 게시물 성과를 집계해 전달.
  실측 성과 표는 즉시 렌더하고, AI 진단(강점·약점·아이디어)은 클라이언트에서 버튼으로 호출한다.
*/
export default async function GrowthPage() {
  const performance = await getPostPerformance();
  return (
    <div className="space-y-5">
      <InsightsTabs current="posts" />
      <GrowthClient performance={performance} />
    </div>
  );
}
