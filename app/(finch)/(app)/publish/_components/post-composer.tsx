"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { SnsIcon } from "@/components/sns-brand-icons";
import { batchPassedToday, earliestPublishDate } from "@/lib/calendar";
import { createPost } from "../actions";
import { COMPOSER_CHANNELS, channelLabel, channelRules, isPublishableChannel } from "@/lib/publish-rules";
import { eunNeun, iGa } from "@/lib/josa";

/*
  새 게시물 포스팅 — 링크팜 포스팅 실측(2026-08-19) 재구현.

  링크팜 흐름: 상단 「+ 새 게시물 포스팅」 → SNS 미연동이면 "SNS 연동하기" 안내
  모달(연동하러 가기), 연동이면 작성 화면. 우리도 같은 관문을 둔다 — 연동 없이
  작성부터 시키고 발행에서 실패하게 만드는 것보다, 문 앞에서 이유를 말하는 게 낫다.

  발행 방식은 정직하게 둘이다: **예약 발행 / 초안 저장.**
  「즉시 발행」은 줄은 보이되 비활성 — 실제 발행은 KST 06:00 배치(크론)라 "즉시"가
  거짓이 되고, 실시간 발행 API 배선은 지시대로 맨 마지막 단계다. 없는 기능을 있는
  것처럼 두지 않는다(이 레포가 계속 걷어내 온 그것).

  채널: 발행 어댑터가 있는 인스타그램·스레드가 활성이다(lib/meta/*-publish.ts).
  틱톡은 발행 API 자체가 없어 "(준비 중)" 비활성 — social_feed 채널 선택과 같은 규칙.

  **글자·장수 상한은 채널마다 다르다**(인스타 2200자·이미지 필수 / 스레드 500자·글만도 가능).
  값은 lib/publish-rules.ts 한 곳에서 서버 액션과 함께 본다 — 여기 하드코딩하면
  「화면은 막는데 서버는 받는」 식으로 갈라진다.
*/

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
  /* 채널을 바꾸면 상한도 바뀐다 — 인스타 2200자로 쓰다 스레드로 넘기면 500자에 걸린다.
     그 사실을 저장 버튼을 누른 뒤가 아니라 글자수 카운터에서 즉시 보이게 한다. */
  const rules = channelRules(channel);
  const MAX_IMAGES = rules.maxImages;
  const CAPTION_MAX = rules.textMax;
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

  /* 업로드 전 클라이언트 축소 — 이유가 둘 겹친다.
     ① 서버 액션 바디 상한: 원본 사진(1~8MB)을 base64(+33%)로 통째 넘기면
        next.config.ts 의 bodySizeLimit(25mb)에 캐러셀이 못 든다. 여기서 줄여야
        10장이 안전하게 들어간다 — 상한을 올리는 쪽만 하면 100MB 급 요청을
        서버가 받아주는 꼴이 된다.
     ② 인스타그램 발행 API 는 JPEG 만 받는다 — 어차피 변환할 것, 지금 한다.
     1440px 는 인스타 권장 최대 해상도라 화질 손해가 아니다. */
  const MAX_DIMENSION = 1440;

  async function toJpegDataUrl(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode"));
        el.src = url;
      });
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      /* JPEG 엔 알파가 없다 — PNG 투명 영역이 검게 구워지지 않게 흰 바탕을 먼저 깐다 */
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL("image/jpeg", 0.85);
      /* 장당 상한 — 고엔트로피 원본이 크게 구워지면 한 단계 낮춰 다시(아래 합산 가드와 짝) */
      return out.length > 1_400_000 ? canvas.toDataURL("image/jpeg", 0.72) : out;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // 같은 파일 재선택 허용
    const room = MAX_IMAGES - images.length;
    /* 정상 선택이면 이전 경고를 지운다 — 안 지우면 상한 경고가 해소된 뒤에도 남는다 */
    setError(files.length > room ? `이미지는 ${MAX_IMAGES}장까지예요.` : null);
    for (const f of files.slice(0, Math.max(0, room))) {
      try {
        const dataUrl = await toJpegDataUrl(f);
        setImages((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, dataUrl]));
      } catch {
        setError("이미지를 읽지 못했어요. 다른 파일로 시도해 주세요.");
      }
    }
  }

  /* 스레드는 글만 있는 게시물이 정상이라 이미지를 요구하지 않는다(rules.minImages=0).
     인스타는 캡션도 이미지도 둘 다 필수다 — requiresText 와 minImages 는 별개 관문이다. */
  const overText = caption.length > CAPTION_MAX;
  const underImages = images.length < rules.minImages;
  const overImages = images.length > MAX_IMAGES;
  const missingText = rules.requiresText && caption.trim().length === 0;
  const canSave =
    !missingText &&
    !underImages &&
    !overImages &&
    !overText &&
    (caption.trim().length > 0 || images.length > 0) &&
    (mode === "draft" || date >= earliest) &&
    !saving;

  /* 채널을 바꾸면 이미 쓴 내용이 소급해 무효가 될 수 있다(인스타 1000자 → 스레드 500자,
     스레드 글 전용 → 인스타 이미지 필수). 예전엔 저장 버튼만 조용히 꺼져서 **왜 막혔는지
     화면 어디에도 없었다** — 특히 이미지 쪽은 빨개지는 것조차 없었다(2026-08-31 점검 적발). */
  function switchChannel(next: string) {
    setChannel(next);
    const r = channelRules(next);
    const name = channelLabel(next);
    if (caption.length > r.textMax) {
      setError(`${eunNeun(name)} ${r.textMax}자까지 쓸 수 있어요 — ${caption.length - r.textMax}자를 줄여 주세요.`);
    } else if (images.length < r.minImages) {
      setError(`${eunNeun(name)} 이미지가 ${r.minImages}장 이상 필요해요.`);
    } else if (images.length > r.maxImages) {
      setError(`${eunNeun(name)} 이미지를 ${r.maxImages}장까지 올릴 수 있어요.`);
    } else if (r.requiresText && caption.trim().length === 0) {
      setError(`${eunNeun(name)} ${iGa(r.textLabel)} 필요해요.`);
    } else {
      setError(null); // 이전 채널의 경고를 남기지 않는다
    }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      /* 전송 합산 가드(쏘넷 점검) — 서버 액션 요청 본문은 Vercel 이 4.5MB 에서 끊는다
         (next.config bodySizeLimit 과 무관 — links 이미지 업로드와 같은 실측 사실).
         배열째 한 번에 보내는 구조라, 합산이 3MB(원본 기준)를 넘으면 보내기 전에 막고 말한다. */
      const totalBytes = images.reduce((n, u) => n + Math.floor((u.length * 3) / 4), 0);
      if (totalBytes > 3_000_000) {
        setError("사진 용량 합계가 커요 — 몇 장을 빼고 다시 시도해 주세요.");
        setSaving(false);
        return;
      }
      const res = await createPost({ channel, caption: caption.trim(), images, mode, date });
      if (!res.ok) {
        setError(res.error ?? "저장하지 못했어요.");
        return;
      }
      onSaved(mode === "draft" ? "초안으로 저장했어요." : `${date} 발행으로 예약했어요.`);
    } catch {
      /* {ok:false} 정상 반환이 아니라 호출 자체가 던진 경우(바디 상한 초과·네트워크) —
         잡지 않으면 에러 오버레이가 뜨고 작성 내용이 통째로 위험해진다 */
      setError("저장하지 못했어요. 이미지 수를 줄이거나 잠시 후 다시 시도해 주세요.");
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
        className="modal-card-in shadow-pop flex max-h-[92dvh] w-full max-w-[550px] flex-col overflow-hidden rounded-card border border-line bg-body outline-none sm:max-h-[88dvh]"
      >
        <div className="flex items-center gap-2 px-5 pt-4">
          <h2 className="flex-1 text-[17px] font-semibold">새 게시물 포스팅</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={requestClose}
            className="relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg hover:bg-tint-hover"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 채널 — 연결된 채널만 활성. 실제 발행 API 는 인스타그램뿐이다 */}
          <div>
            <p className="text-[12px] font-medium text-fg-sub">채널</p>
            {/* flex-wrap 없이 칩 3개를 한 줄에 눌러 담아서, 390px 에서 라벨이 «인스타그/램» 처럼
                단어 중간에 끊겼다(실측: 칩 높이 60.8px·2줄). 위 채널 스트립은 이미 wrap 이다 — 규칙을 맞춘다. */}
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="발행 채널">
              {COMPOSER_CHANNELS.map((ch) => {
                const meta = channels.find((c) => c.channel === ch);
                const publishable = isPublishableChannel(ch); // 발행 어댑터가 있는 채널만
                const usable = publishable && (isDemo || !!meta?.connected);
                return (
                  <button
                    key={ch}
                    type="button"
                    role="radio"
                    aria-checked={channel === ch}
                    disabled={!usable}
                    onClick={() => switchChannel(ch)}
                    className={cn(
                      "trans-state inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border px-3 py-1.5 text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-45",
                      channel === ch ? "border-2 border-primary" : "border-line hover:bg-tint-hover",
                    )}
                  >
                    <SnsIcon kind={ch} className="size-3.5" />
                    {channelLabel(ch)}
                    {!publishable ? <span className="text-[11px] text-fg-faint">준비 중</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 이미지 — 1~10장(캐러셀 상한) */}
          <div>
            <p className="text-[12px] font-medium text-fg-sub">
              이미지{" "}
              {rules.minImages === 0 ? <span className="font-normal text-fg-faint">(선택)</span> : null}{" "}
              {/* 부족·초과를 캡션 카운터와 같은 신호로 — 예전엔 이미지만 아무 표시가 없었다 */}
              <span className={cn("tnum", underImages || overImages ? "text-negative" : undefined)}>
                {images.length}/{MAX_IMAGES}
              </span>
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
                {rules.textLabel}
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
