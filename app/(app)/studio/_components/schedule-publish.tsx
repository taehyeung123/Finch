"use client";

import Link from "next/link";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { batchPassedToday, earliestPublishDate } from "@/lib/calendar";
import { buildFinalBlobs, type ExportSlide, type LoadedLogo } from "@/lib/studio/export-slides";
import type { CardTemplate } from "@/lib/studio/templates";

/**
 * 예약 발행 패널 — 캡션·날짜 입력 후 슬라이드를 PNG로 렌더해 서버에 업로드하고 예약을 등록한다.
 * 편집기로 수정한 슬라이드(edits)는 그 이미지를 그대로 업로드한다.
 * Vercel 크론은 하루 1회 빈도라 '예약일 아침 배치'로 발행됨을 명시한다(정시 발행 아님).
 */
export function SchedulePublish({
  slides,
  aiGenerated,
  edits,
  template,
  logo,
}: {
  slides: ExportSlide[];
  aiGenerated: boolean;
  edits: Record<number, string>;
  template?: CardTemplate;
  logo?: LoadedLogo;
}) {
  const [open, setOpen] = useState(false);
  // 캡션 기본값 — 표지 헤드라인 + 부연으로 초안을 만든다 (사용자가 수정 가능)
  const [caption, setCaption] = useState(() =>
    [slides[0]?.headline, slides[0]?.footnote].filter(Boolean).join("\n").trim(),
  );
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState<"schedule" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"schedule" | "draft" | null>(null);

  /* 고를 수 있는 **가장 이른 날**. 단순히 "오늘"이 아니다 — 배치는 KST 06:00 에
     하루 한 번만 돌아서, 06시가 지난 뒤 오늘을 고르면 내일 아침에 나간다.
     고를 수 없는 날은 애초에 안 열리게 한다. */
  const today = earliestPublishDate();
  const batchPassed = batchPassedToday();

  /* mode="draft" 는 날짜 없이 저장한다. 크레딧을 써서 만든 결과물인데 날짜를 못
     정하면 저장 자체가 안 되던 것이 초안을 만든 이유다 — 화면을 떠나면 사라졌다. */
  async function submit(mode: "schedule" | "draft") {
    if (busy || !caption.trim()) return;
    if (mode === "schedule" && !date) return;
    setBusy(mode);
    setError(null);
    try {
      const blobs = await buildFinalBlobs(slides, aiGenerated, edits, template, logo);
      const form = new FormData();
      form.set("caption", caption.trim());
      form.set("scheduledAt", date);
      if (mode === "draft") form.set("draft", "1");
      blobs.forEach((b, i) => form.append("images", b, `slide-${i + 1}.png`));

      const res = await fetch("/api/studio/schedule", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? (mode === "draft" ? "초안 저장에 실패했어요." : "예약 등록에 실패했어요."));
        return;
      }
      setDone(mode);
    } catch {
      setError("이미지 생성 중 오류가 발생했어요.");
    } finally {
      setBusy(null);
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
        <p className="text-[15px] font-semibold">인스타그램 예약 발행</p>
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
        <p className="mt-3 text-[14px] text-positive-strong">
          {done === "draft"
            ? "초안으로 저장했어요. 발행되지 않으니 언제든 날짜를 정하세요. "
            : "예약이 등록됐어요. 예약일 아침 배치에서 자동으로 발행됩니다. "}
          {/* 목록이 스튜디오 밖(/publish)으로 나갔으므로 "아래 목록" 대신 링크로 안내한다 */}
          <Link href="/publish" className="font-semibold underline underline-offset-2">
            발행에서 확인
          </Link>
          할 수 있어요.
        </p>
      ) : (
        <>
          <label className="mt-3 block text-[14px] font-medium text-fg-sub">캡션</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-card border border-line bg-body px-3 py-2 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
            placeholder="게시물에 들어갈 캡션을 입력하세요"
          />

          <label className="mt-3 block text-[14px] font-medium text-fg-sub">발행 예정일</label>
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 h-10 rounded-card border border-line bg-body px-3 text-[15px] text-fg focus:border-primary focus:outline-none"
          />
          <p className="mt-1.5 text-[12px] text-fg-sub">
            정확한 시각이 아니라 예약일 아침 배치(하루 1회, 오전 6시)에서 자동 발행됩니다.
            {batchPassed ? " 오늘 배치는 이미 지나서 내일부터 고를 수 있어요." : ""}
            {" "}날짜를 아직 안 정했다면 초안으로 저장하세요.
          </p>

          {error ? <p className="mt-2 text-[14px] text-negative-strong">{error}</p> : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => submit("schedule")} disabled={!date || !caption.trim() || busy !== null}>
              {busy === "schedule" ? "이미지 준비 중…" : "예약하기"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => submit("draft")}
              disabled={!caption.trim() || busy !== null}
            >
              {busy === "draft" ? "저장 중…" : "초안으로 저장"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
