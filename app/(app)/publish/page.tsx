import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/section-header";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PublishList, type ScheduledPost } from "./_components/publish-list";

export const metadata: Metadata = {
  title: "발행",
  robots: { index: false, follow: false },
};

/*
  발행 — 2026-08-15 IA 개편으로 신설.

  예약 발행 자체는 원래 있었다(0010_scheduled_posts + /api/studio/schedule +
  하루 1회 크론 publish-scheduled). 문제는 **진입점**이었다:
   · 스튜디오 화면 하단에 패널 한 줄로 붙어 있어 메뉴에 존재하지 않았고
   · 그 패널이 예약 0건이면 null 을 반환해 **화면에서 통째로 사라졌다**.
  즉 한 번도 예약해본 적 없는 사람에게는 없는 기능이었다.

  목록은 **서버에서 조회한다**. 앞서는 클라이언트가 마운트 후 /api/studio/scheduled 를
  불렀는데, 그러면 첫 페인트가 비어 있다가 채워지고(깜빡임) effect 안 setState 로
  캐스케이딩 렌더도 생긴다. 인증·RLS 는 서버에서 그대로 걸린다.

  캘린더·초안·멀티채널은 개편 5단계(포스팅 워크플로)에서 붙인다.
*/
async function loadScheduled(): Promise<ScheduledPost[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("scheduled_posts")
    .select("id, caption, image_urls, scheduled_at, status, error")
    .order("scheduled_at", { ascending: true })
    .limit(20);
  if (error) {
    console.error("[publish] 예약 목록 조회 실패:", error.message);
    return [];
  }
  return (data ?? []) as ScheduledPost[];
}

export default async function PublishPage() {
  const items = await loadScheduled();

  return (
    <div className="space-y-5">
      <PageHeader
        title="발행"
        description="예약한 게시물을 확인하고 관리합니다. 예약일 아침 배치에서 자동으로 발행됩니다."
      />
      <PublishList initialItems={items} />
    </div>
  );
}
