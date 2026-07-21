"use client";

import { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from "react";
import { CalendarClock, ImageIcon, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cancelScheduledPost } from "../actions";

interface ScheduledPost {
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

export interface ScheduledPostsPanelHandle {
  refresh: () => void;
}

/** 예약 발행 목록 — 마운트 시 자체 조회, 예약 성공 시 부모가 ref.refresh()로 갱신 트리거 */
export const ScheduledPostsPanel = forwardRef<ScheduledPostsPanelHandle>(function ScheduledPostsPanel(_props, ref) {
  const [items, setItems] = useState<ScheduledPost[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/scheduled");
      const data = (await res.json()) as { items?: ScheduledPost[] };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  async function cancel(id: string) {
    setItems((prev) => prev?.map((p) => (p.id === id ? { ...p, status: "canceled" } : p)) ?? null);
    await cancelScheduledPost(id);
    void load();
  }

  if (!items || items.length === 0) return null;

  return (
    <Card>
      <CardHeader title="예약 발행 목록" description="예약일 아침 배치에서 자동 발행됩니다" />
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
});
