"use client";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderSlidesToBlobs, type ExportSlide } from "@/lib/studio/export-slides";

/**
 * 예약 발행 패널 — 캡션·날짜 입력 후 슬라이드를 PNG로 렌더해 서버에 업로드하고 예약을 등록한다.
 * Vercel 크론은 하루 1회 빈도라 '예약일 아침 배치'로 발행됨을 명시한다(정시 발행 아님).
 */
export function SchedulePublish({
  slides,
  aiGenerated,
  onScheduled,
}: {
  slides: ExportSlide[];
  aiGenerated: boolean;
  onScheduled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState(() => `${slides[0]?.head ?? ""}\n${slides[0]?.sub ?? ""}`.trim());
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function submit() {
    if (!date || !caption.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const blobs = await renderSlidesToBlobs(slides, aiGenerated);
      const form = new FormData();
      form.set("caption", caption.trim());
      form.set("scheduledAt", date);
      blobs.forEach((b, i) => form.append("images", b, `slide-${i + 1}.png`));

      const res = await fetch("/api/studio/schedule", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "예약 등록에 실패했어요.");
        return;
      }
      setDone(true);
      onScheduled();
    } catch {
      setError("이미지 생성 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CalendarClock className="size-4" aria-hidden />
        예약 발행으로 보내기
      </Button>
    );
  }

  return (
    <div className="w-full rounded-card border border-line bg-overlay p-4">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold">인스타그램 예약 발행</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-card p-1 text-fg-faint hover:bg-body hover:text-fg"
          aria-label="닫기"
        >
          <X className="size-4" />
        </button>
      </div>

      {done ? (
        <p className="mt-3 text-[13px] text-positive">
          예약이 등록됐어요. 예약일 아침 배치에서 자동으로 발행됩니다. 아래 목록에서 확인·취소할 수 있어요.
        </p>
      ) : (
        <>
          <label className="mt-3 block text-[13px] font-medium text-fg-sub">캡션</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-card border border-line bg-body px-3 py-2 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
            placeholder="게시물에 들어갈 캡션을 입력하세요"
          />

          <label className="mt-3 block text-[13px] font-medium text-fg-sub">발행 예정일</label>
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 h-10 rounded-card border border-line bg-body px-3 text-[14px] text-fg focus:border-primary focus:outline-none"
          />
          <p className="mt-1.5 text-[12px] text-fg-faint">
            정확한 시각이 아니라 예약일 아침 배치(하루 1회)에서 자동 발행됩니다.
          </p>

          {error ? <p className="mt-2 text-[13px] text-negative">{error}</p> : null}

          <Button className="mt-3" onClick={submit} disabled={!date || !caption.trim() || busy}>
            {busy ? "이미지 준비 중…" : "예약하기"}
          </Button>
        </>
      )}
    </div>
  );
}
