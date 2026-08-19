"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { SnsIcon } from "@/components/sns-brand-icons";
import { batchPassedToday, earliestPublishDate } from "@/lib/calendar";
import { createPost } from "../actions";

/*
  새 게시물 포스팅 — 링크팜 포스팅 실측(2026-08-19) 재구현.

  링크팜 흐름: 상단 「+ 새 게시물 포스팅」 → SNS 미연동이면 "SNS 연동하기" 안내
  모달(연동하러 가기), 연동이면 작성 화면. 우리도 같은 관문을 둔다 — 연동 없이
  작성부터 시키고 발행에서 실패하게 만드는 것보다, 문 앞에서 이유를 말하는 게 낫다.

  발행 방식은 정직하게 둘이다: **예약 발행 / 초안 저장.**
  「즉시 발행」은 줄은 보이되 비활성 — 실제 발행은 KST 06:00 배치(크론)라 "즉시"가
  거짓이 되고, 실시간 발행 API 배선은 지시대로 맨 마지막 단계다. 없는 기능을 있는
  것처럼 두지 않는다(이 레포가 계속 걷어내 온 그것).

  채널: 실제 발행 함수가 인스타그램뿐이다(lib/meta/instagram-publish.ts).
  tiktok·threads 는 "(준비 중)" 비활성 — social_feed 채널 선택과 같은 규칙.
*/

const CAPTION_MAX = 2200; // 인스타그램 캡션 상한
const MAX_IMAGES = 10; // 캐러셀 상한(0010 check 와 동일)

export interface ComposerChannel {
  channel: string;
  handle: string | null;
  connected: boolean;
}

export function PostComposer({
  channels,
  isDemo,
  defaultDate,
  onClose,
  onSaved,
}: {
  channels: ComposerChannel[];
  isDemo: boolean;
  /** 캘린더에서 날짜를 골라 들어온 경우 — 예약 모드로 그 날짜가 미리 채워진다 */
  defaultDate: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const anyConnected = isDemo || channels.some((c) => c.connected);

  const earliest = earliestPublishDate();
  const [channel, setChannel] = useState("instagram");
  const [images, setImages] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<"schedule" | "draft">(defaultDate ? "schedule" : "schedule");
  const [date, setDate] = useState(defaultDate && defaultDate >= earliest ? defaultDate : earliest);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestCloseRef = useRef<() => void>(() => {});

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();
    return () => prev?.focus?.();
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.isComposing) requestCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const dirty = images.length > 0 || caption.trim().length > 0;
  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("작성 중인 내용이 사라져요. 닫을까요?")) return;
    onClose();
  }
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // 같은 파일 재선택 허용
    const room = MAX_IMAGES - images.length;
    if (files.length > room) setError(`이미지는 ${MAX_IMAGES}장까지예요.`);
    for (const f of files.slice(0, Math.max(0, room))) {
      const r = new FileReader();
      r.onload = () => setImages((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, String(r.result)]));
      r.readAsDataURL(f);
    }
  }

  const canSave =
    images.length > 0 &&
    caption.trim().length > 0 &&
    caption.length <= CAPTION_MAX &&
    (mode === "draft" || date >= earliest) &&
    !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createPost({ channel, caption: caption.trim(), images, mode, date });
      if (!res.ok) {
        setError(res.error ?? "저장하지 못했어요.");
        return;
      }
      onSaved(mode === "draft" ? "초안으로 저장했어요." : `${date} 발행으로 예약했어요.`);
    } finally {
      setSaving(false);
    }
  }

  /* ── 미연동 관문 — 링크팜 "SNS 연동하기" 모달 문법 ── */
  if (!anyConnected) {
    return (
      <div
        className="modal-scrim-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="SNS 연동 안내"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal-card-in shadow-pop w-full max-w-md rounded-card border border-line bg-body p-6">
          <h2 className="text-[17px] font-semibold">SNS 연동하기</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-sub">
            아직 연동된 SNS 계정이 없어요. 계정을 연동하면 게시물 예약 발행, 채널 분석, 댓글 자동 DM 까지 쓸 수
            있습니다.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              닫기
            </Button>
            <ButtonLink href="/settings">연동하러 가기</ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  const input =
    "w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="새 게시물 포스팅"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="modal-card-in shadow-pop flex max-h-[92vh] w-full max-w-[550px] flex-col overflow-hidden rounded-card border border-line bg-body outline-none sm:max-h-[88vh]"
      >
        <div className="flex items-center gap-2 px-5 pt-4">
          <h2 className="flex-1 text-[17px] font-semibold">새 게시물 포스팅</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={requestClose}
            className="rounded-card p-1.5 text-fg hover:bg-tint-hover"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 채널 — 연결된 채널만 활성. 실제 발행 API 는 인스타그램뿐이다 */}
          <div>
            <p className="text-[12px] font-medium text-fg-sub">채널</p>
            <div className="mt-1.5 flex gap-2" role="radiogroup" aria-label="발행 채널">
              {(["instagram", "tiktok", "threads"] as const).map((ch) => {
                const meta = channels.find((c) => c.channel === ch);
                const publishable = ch === "instagram"; // 발행 함수가 인스타그램뿐
                const usable = publishable && (isDemo || !!meta?.connected);
                return (
                  <button
                    key={ch}
                    type="button"
                    role="radio"
                    aria-checked={channel === ch}
                    disabled={!usable}
                    onClick={() => setChannel(ch)}
                    className={cn(
                      "trans-state inline-flex items-center gap-1.5 rounded-chip border px-3 py-1.5 text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-45",
                      channel === ch ? "border-2 border-primary" : "border-line hover:bg-tint-hover",
                    )}
                  >
                    <SnsIcon kind={ch} className="size-3.5" />
                    {ch === "instagram" ? "인스타그램" : ch === "tiktok" ? "틱톡" : "스레드"}
                    {!publishable ? <span className="text-[11px] text-fg-faint">준비 중</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 이미지 — 1~10장(캐러셀 상한) */}
          <div>
            <p className="text-[12px] font-medium text-fg-sub">
              이미지 <span className="tnum">{images.length}/{MAX_IMAGES}</span>
            </p>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {images.map((src, i) => (
                <span key={i} className="relative aspect-square overflow-hidden rounded-card border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 업로드 전 로컬 미리보기(data URL) */}
                  <img src={src} alt={`이미지 ${i + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label={`이미지 ${i + 1} 제거`}
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 rounded-card bg-scrim p-1 text-on-scrim hover:opacity-80"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {images.length < MAX_IMAGES ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="trans-state flex aspect-square flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line text-fg-sub hover:border-primary hover:text-fg"
                >
                  <ImagePlus className="size-5" aria-hidden />
                  <span className="text-[11px]">추가</span>
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={pickFiles}
            />
          </div>

          {/* 캡션 */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="pc-caption" className="text-[12px] font-medium text-fg-sub">
                캡션
              </label>
              <span className={cn("tnum text-[12px]", caption.length > CAPTION_MAX ? "text-negative" : "text-fg-sub")}>
                {caption.length}/{CAPTION_MAX}
              </span>
            </div>
            <textarea
              id="pc-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              maxLength={CAPTION_MAX}
              placeholder={"본문을 입력하세요.\n#해시태그 도 여기 함께 씁니다."}
              className={`${input} mt-1.5 resize-y py-2.5 leading-relaxed`}
            />
          </div>

          {/* 발행 방식 */}
          <div>
            <p className="text-[12px] font-medium text-fg-sub">발행 방식</p>
            <div className="mt-1.5 space-y-1.5" role="radiogroup" aria-label="발행 방식">
              <label
                className={cn(
                  "flex cursor-pointer flex-wrap items-center gap-2.5 rounded-card border px-3.5 py-2.5",
                  mode === "schedule" ? "border-2 border-primary" : "border-line hover:bg-tint-hover",
                )}
              >
                <input
                  type="radio"
                  name="pc-mode"
                  checked={mode === "schedule"}
                  onChange={() => setMode("schedule")}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span className="text-[15px] font-medium">예약 발행</span>
                {mode === "schedule" ? (
                  <input
                    type="date"
                    min={earliest}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="발행일"
                    className="tnum h-9 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
                  />
                ) : null}
                <span className="w-full text-[12px] text-fg-sub">
                  예약일 오전 6시 배치에서 자동 발행돼요.
                  {batchPassedToday() ? " 오늘 배치는 지나서 내일부터 고를 수 있어요." : ""}
                </span>
              </label>

              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-card border px-3.5 py-2.5",
                  mode === "draft" ? "border-2 border-primary" : "border-line hover:bg-tint-hover",
                )}
              >
                <input
                  type="radio"
                  name="pc-mode"
                  checked={mode === "draft"}
                  onChange={() => setMode("draft")}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span className="text-[15px] font-medium">초안으로 저장</span>
                <span className="text-[12px] text-fg-sub">날짜는 나중에 정해요.</span>
              </label>

              {/* 즉시 발행 — 실시간 발행 API 배선 전까지 정직하게 비활성.
                  "즉시"라고 해놓고 다음날 아침 배치에 태우는 건 거짓말이다. */}
              <div className="flex items-center gap-2.5 rounded-card border border-line px-3.5 py-2.5 opacity-45">
                <input type="radio" disabled className="size-4" aria-label="즉시 발행 (준비 중)" />
                <span className="text-[15px] font-medium">즉시 발행</span>
                <span className="text-[12px] text-fg-sub">연동 API 준비 중 — 지금은 예약 발행으로.</span>
              </div>
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-[14px] text-negative-strong">
              {error}
            </p>
          ) : null}
        </div>

        <div className="px-5 pb-5 pt-3">
          <Button className="w-full" disabled={!canSave} onClick={save}>
            {saving ? "저장 중…" : mode === "draft" ? "초안으로 저장" : "예약하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
