import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ImageIcon, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadFailed } from "@/components/ui/load-failed";
import { ButtonLink } from "@/components/ui/button";
import { StatusPill, type PostStatus } from "@/components/ui/status-pill";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { scheduledPosts as demoPosts } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "내 콘텐츠",
  robots: { index: false, follow: false },
};

/*
  내 콘텐츠 — 2026-08-15 IA 개편으로 메뉴에 신설.
  크레딧을 써서 만든 자산이 어디에도 남지 않던 문제를 막는 자리다.
  "보관함"이라는 이름은 레퍼런스 스크랩과 헷갈려 쓰지 않는다 —
  남이 만든 것은 스크랩, 내가 만든 것은 내 콘텐츠.

  ⚠️ 2026-08-25 이전에는 **조회가 아예 없었다.** 페이지 전체가 하드코딩된 빈 상태 한 장이라,
  카드뉴스를 만들고 PNG 를 내려받고 초안으로 저장까지 해도 「아직 만든 콘텐츠가 없어요」만 나왔다.
  메뉴에 있는 화면이 영원히 비어 있으면 «만든 게 사라진다»로 읽힌다.

  스튜디오의 「초안으로 저장」·「예약」은 scheduled_posts 로 들어간다(studio/actions.ts).
  새 표를 만들지 않고 그 기록을 여기서 읽는다 — 이미 쌓이고 있는 것을 보여주는 게 먼저다.
  (원본 슬라이드 편집 상태를 다시 여는 것은 별도 작업이다. 지금은 «무엇을 만들었는지»를 돌려준다.)
*/

interface Work {
  id: string;
  caption: string;
  image_urls: string[];
  scheduled_at: string;
  status: PostStatus;
}

async function load(): Promise<{ works: Work[]; failed: boolean }> {
  if (isDemoMode()) return { works: demoPosts as Work[], failed: false };
  const user = await getAuthUser();
  if (!user) return { works: [], failed: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_posts")
    .select("id, caption, image_urls, scheduled_at, status")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) {
    /* 실패는 «없음»이 아니다 — 만든 게 없다고 단정하면 다시 만들게 된다(lib/data/internal.ts 규칙) */
    console.error("[studio/works] 조회 실패:", error.message);
    return { works: [], failed: true };
  }
  return { works: (data ?? []) as Work[], failed: false };
}

export default async function Page() {
  const { works, failed } = await load();

  return (
    <div className="space-y-5">
      <PageHeader title="내 콘텐츠" description="스튜디오에서 만든 카드뉴스를 모아 봅니다." />
      {failed ? (
        <LoadFailed title="내 콘텐츠를 불러오지 못했어요" />
      ) : works.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Sparkles}
              title="아직 만든 콘텐츠가 없어요"
              description="스튜디오에서 카드뉴스를 만들고 「초안으로 저장」하면 여기에 쌓입니다."
              action={<ButtonLink href="/studio">만들기</ButtonLink>}
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <ul className="divide-y divide-line">
              {works.map((w) => (
                <li key={w.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-plate text-fg-faint">
                    {w.image_urls?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 서명 만료되는 Storage URL 이라 최적화 프록시를 거치지 않는다
                      <img src={w.image_urls[0]} alt="" className="size-full object-cover" />
                    ) : (
                      <ImageIcon className="size-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">
                      {w.caption?.split("\n")[0] || "(캡션 없음)"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-sub">
                      <CalendarClock className="size-3" aria-hidden />
                      {formatDate(w.scheduled_at)}
                      {w.image_urls?.length ? ` · ${w.image_urls.length}장` : ""}
                    </p>
                  </div>
                  <StatusPill status={w.status} />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-fg-sub">
              날짜를 잡거나 지우는 것은 <Link href="/publish" className="font-semibold text-primary-ink underline underline-offset-2">발행</Link> 화면에서 할 수 있어요.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
