"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ImageIcon, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cancelScheduledPost } from "@/app/(app)/studio/actions";

export interface ScheduledPost {
  id: string;
  caption: string;
  image_urls: string[];
  scheduled_at: string;
  status: "scheduled" | "publishing" | "published" | "failed" | "canceled";
  error: string | null;
}

const STATUS_META: Record<ScheduledPost["status"], { label: string; tone: "positive" | "warning" | "neutral" | "negative" }> = {
  scheduled: { label: "예약됨", tone: "neutral" },
  publishing: { label: "발행 중", tone: "warning" },
  published: { label: "발행 완료", tone: "positive" },
  failed: { label: "발행 실패", tone: "negative" },
  canceled: { label: "취소됨", tone: "neutral" },
};

/**
 * 예약 발행 목록 — 서버(page.tsx)가 조회한 목록을 받아 그린다.
 *
 * 앞서는 스튜디오 하단에 붙어 있었고 부모가 ref.refresh()로 갱신을 밀어넣었다.
 * /publish 독립 화면이 되면서 그 결합을 끊었다 — 예약 직후 갱신은 스튜디오가
 * "발행에서 확인" 링크로 넘기는 것으로 대체한다.
 */
export function PublishList({ initialItems }: { initialItems: ScheduledPost[] }) {
  /* 서버가 준 목록을 그대로 첫 렌더에 쓴다 — 마운트 후 fetch 하면 빈 화면이 한 번
     깜빡이고, effect 안 setState 는 캐스케이딩 렌더를 만든다. */
  const [items, setItems] = useState<ScheduledPost[]>(initialItems);
  const [, startTransition] = useTransition();
  const router = useRouter();

  /* 서버가 새 목록을 주면(취소 후 router.refresh) 낙관적 상태를 서버 값으로 덮는다.
     useState 초기값은 첫 마운트에만 쓰이므로 이 동기화가 없으면 refresh 가 화면에
     반영되지 않는다. effect 대신 렌더 시점 조정 — 이 레포의 다른 곳(search-console)과
     같은 관례이고 캐스케이딩 렌더가 없다. */
  const [prevInitial, setPrevInitial] = useState(initialItems);
  if (initialItems !== prevInitial) {
    setPrevInitial(initialItems);
    setItems(initialItems);
  }

  function cancel(id: string) {
    /* 낙관적 갱신 후 **반드시 서버 값으로 맞춘다.**
       cancelScheduledPost 는 .eq("status","scheduled") 가드가 있어서,
       누르는 순간 크론이 이미 발행했으면 0행 매치 + 에러 없음 → ok:true 를 준다.
       그 경우 DB 는 published 인데 화면만 "취소됨"으로 굳는다.
       그래서 성공·실패와 무관하게 refresh 로 서버 상태를 다시 읽는다. */
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: "canceled" } : p)));
    startTransition(async () => {
      await cancelScheduledPost(id);
      router.refresh();
    });
  }

  /* 0건일 때 null 을 반환하던 것이 이 기능이 메뉴에서 사라져 보이던 원인이었다.
     빈 상태는 "없음"을 알리는 자리가 아니라 다음 행동을 주는 자리다. */
  if (items.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={CalendarClock}
            title="아직 예약한 게시물이 없어요"
            description="스튜디오에서 카드뉴스를 만들면 여기서 발행 일정을 잡을 수 있어요."
            action={<ButtonLink href="/studio">스튜디오에서 만들기</ButtonLink>}
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="예약 목록" description="예약일 아침 배치에서 자동 발행됩니다" />
      <CardBody>
        <ul className="divide-y divide-line">
          {items.map((post) => {
            const meta = STATUS_META[post.status];
            return (
              <li key={post.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-overlay">
                  {post.image_urls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 공개 URL, 최적화 프록시 불필요
                    <img src={post.image_urls[0]} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-4 text-fg-faint" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{post.caption.split("\n")[0] || "(캡션 없음)"}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-faint">
                    <CalendarClock className="size-3" aria-hidden />
                    {post.scheduled_at.slice(0, 10)}
                    {post.status === "failed" && post.error ? ` · ${post.error}` : ""}
                  </p>
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
                {post.status === "scheduled" ? (
                  <button
                    type="button"
                    onClick={() => cancel(post.id)}
                    className="rounded-card p-1.5 text-fg-faint hover:bg-overlay hover:text-negative"
                    aria-label="예약 취소"
                    title="예약 취소"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
