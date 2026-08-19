import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/section-header";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { accounts as sampleAccounts } from "@/lib/data";
import type { ComposerChannel } from "./_components/post-composer";
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

  목록은 **서버에서 조회한다**. 앞서는 클라이언트가 마운트 후 별도 API 를 불렀는데
  (그 엔드포인트는 이제 없다), 그러면 첫 페인트가 비어 있다가 채워지고(깜빡임)
  effect 안 setState 로 캐스케이딩 렌더도 생긴다. 인증·RLS 는 서버에서 그대로 걸린다.

  **초안과 예약을 따로 조회한다.** 한 쿼리로 최신순 200건을 뽑으면, 초안이 쌓였을 때
  (초안의 scheduled_at 은 "만든 시각"이다) 상위 200위를 초안이 채워 진짜 미래 예약이
  화면에서 사라진다. 성격이 다른 목록은 쿼리도 나눈다.

  ⚠️ **발행은 현재 인스타그램만 된다.** 실제 발행 함수가 lib/meta/instagram-publish.ts
  하나뿐이고 TikTok·Threads 발행 API 는 코드에 없다. 화면이 "발행"이라고만 하면
  다채널 예약처럼 읽히므로 헤더에 명시한다 — 없는 기능을 있는 것처럼 두지 않는다.
*/
/** 최신순 절삭 한도 — 넘치면 화면이 조용히 거짓말하지 않도록 truncated 로 알린다 */
const PAGE_LIMIT = 200;

async function loadScheduled(): Promise<{ items: ScheduledPost[]; truncated: boolean }> {
  /* isDemoMode + getAuthUser — 이 배치의 다른 화면들과 같은 조합이다.
     · isSupabaseConfigured 만 보면 NEXT_PUBLIC_DEMO_MODE(프로젝트가 죽었을 때의
       탈출구)를 못 잡아, 죽은 DB 에 쿼리를 던지고 렌더가 통째로 깨진다.
     · createClient().auth.getUser() 를 직접 부르면 레이아웃 가드와 합쳐 Auth 서버를
       요청당 2회 왕복한다(lib/supabase/server.ts 가 측정해서 고친 패턴). */
  if (isDemoMode()) return { items: [], truncated: false };
  const user = await getAuthUser();
  if (!user) return { items: [], truncated: false };
  const supabase = await createClient();

  /* 캘린더가 생기면서 조회 범위를 넓혔다. 20건 오름차순이면 **과거만 20건** 나와서
     달력에 이번 달이 통째로 비어 보인다(가장 오래된 20건이 먼저 잡힌다).
     최신순 200건이면 앞뒤 몇 달은 확실히 덮는다. 그보다 오래된 발행 이력을 달력에서
     찾을 일은 없다 — 성과는 성과 분석이 본다. */
  const [sched, drafts] = await Promise.all([
    supabase
      .from("scheduled_posts")
      .select("id, caption, image_urls, scheduled_at, status, error")
      .neq("status", "draft")
      .order("scheduled_at", { ascending: false })
      .limit(PAGE_LIMIT),
    supabase
      .from("scheduled_posts")
      .select("id, caption, image_urls, scheduled_at, status, error")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (sched.error || drafts.error) {
    console.error("[publish] 예약 목록 조회 실패:", sched.error?.message ?? drafts.error?.message);
    return { items: [], truncated: false };
  }
  const items = [...((sched.data ?? []) as ScheduledPost[]), ...((drafts.data ?? []) as ScheduledPost[])];
  return { items, truncated: (sched.data ?? []).length >= PAGE_LIMIT };
}

/** 채널 연결 스트립 데이터 — 데모: 샘플 계정, 실제: connected_accounts */
async function loadChannels(): Promise<ComposerChannel[]> {
  if (isDemoMode()) {
    return sampleAccounts.map((a) => ({ channel: a.channel, handle: a.handle, connected: a.connected }));
  }
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("connected_accounts")
    .select("channel, handle, connected")
    .eq("user_id", user.id);
  return ((data ?? []) as Array<{ channel: string; handle: string | null; connected: boolean }>).map((r) => ({
    channel: r.channel,
    handle: r.handle,
    connected: !!r.connected,
  }));
}

export default async function PublishPage() {
  const [{ items, truncated }, channels] = await Promise.all([loadScheduled(), loadChannels()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="발행"
        description="인스타그램 예약 발행을 확인하고 관리합니다. 예약일 아침 배치에서 자동으로 발행됩니다."
      />
      <PublishList initialItems={items} channels={channels} isDemo={isDemoMode()} truncated={truncated} />
    </div>
  );
}
