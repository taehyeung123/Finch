"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { SnsIcon } from "@/components/sns-brand-icons";
import { earliestPublishAt } from "@/lib/calendar";
import type { ResultModalContent } from "@/components/ui/result-modal";
import { createPost } from "../actions";
import { COMPOSER_CHANNELS, channelLabel, channelRules, isPublishableChannel } from "@/lib/publish-rules";
import { eunNeun, iGa } from "@/lib/josa";

/*
  새 게시물 포스팅 — 링크팜 포스팅 실측(2026-08-19) 재구현.

  링크팜 흐름: 상단 「+ 새 게시물 포스팅」 → SNS 미연동이면 "SNS 연동하기" 안내
  모달(연동하러 가기), 연동이면 작성 화면. 우리도 같은 관문을 둔다 — 연동 없이
  작성부터 시키고 발행에서 실패하게 만드는 것보다, 문 앞에서 이유를 말하는 게 낫다.

  발행 방식은 셋이다: **지금 발행 / 예약 발행(시각) / 초안 저장.**
  2026-09-09 까지 「즉시 발행」은 비활성이었고 예약은 «날짜»만 받았다 — 발행 크론이 하루 한 번(06:00 KST)
  도는 Hobby 시절 설계가 남아 있어서다. 지금은 크론이 5분마다 돌고, 「지금 발행」은 서버 액션이 그 자리에서
  내보내고 결과를 돌려준다(app/(finch)/(app)/publish/actions.ts). 결과는 목록 화면이 모달로 그린다.

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
  /** null = 연동 상태를 **확인하지 못했다**. «계정 없음»과 다르게 다뤄야 한다(관문을 띄우지 않는다) */
  channels: ComposerChannel[] | null;
  isDemo: boolean;
  /** 캘린더에서 날짜를 골라 들어온 경우 — 예약 모드로 그 날짜가 미리 채워진다 */
  defaultDate: string | null;
  onClose: () => void;
  onSaved: (result: ResultModalContent) => void;
}) {
  /* 조회 실패(null)면 관문을 띄우지 않는다 — «계정 없음»이 아니라 «모름»이다. 실제 발행은 서버가 다시 확인한다.
     잘 쓰던 사람을 «연동하세요» 화면으로 튕기는 쪽이 더 나쁘다(2026-09-07 감사). */
  const anyConnected = isDemo || channels === null || channels.some((c) => c.connected);

  const earliestAt = earliestPublishAt();
  const [channel, setChannel] = useState("instagram");
  /* 채널을 바꾸면 상한도 바뀐다 — 인스타 2200자로 쓰다 스레드로 넘기면 500자에 걸린다.
     그 사실을 저장 버튼을 누른 뒤가 아니라 글자수 카운터에서 즉시 보이게 한다. */
  const rules = channelRules(channel);
  const MAX_IMAGES = rules.maxImages;
  const CAPTION_MAX = rules.textMax;
  const [images, setImages] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  /* 기본은 예약이다 — 「지금 발행」은 되돌릴 수 없는 외부 행동이라 기본값으로 두지 않는다 */
  const [mode, setMode] = useState<"now" | "schedule" | "draft">("schedule");
  /* 달력에서 날짜를 골라 왔으면 그날 09:00, 아니면 지금(5분 단위 올림). 이미 지난 시각이면 지금으로 */
  const [when, setWhen] = useState(() =>
    defaultDate && `${defaultDate}T09:00` >= earliestAt ? `${defaultDate}T09:00` : earliestAt,
  );
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
  /* 인스타그램 게시 비율 한계 — 세로 4:5(0.8) ~ 가로 1.91:1. 이 밖이면 Graph API 가 컨테이너 생성에서 거절한다
     (인스타 앱은 알아서 잘라 주지만 API 는 안 잘라 준다). 폰 기본 세로 사진(3:4=0.75)·스크린샷(9:16)이 정확히 밖이라,
     안 자르면 «예약했어요» 뒤 발행 시각에 영어 원문 오류로 실패한다(2026-09-09 감사). 광고 소재(lib/ads/image-spec.ts)와 같은 값. */
  const IG_MIN_RATIO = 0.8;
  const IG_MAX_RATIO = 1.91;

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = src;
    });
  }

  /**
   * 축소 + JPEG 변환 (+ 인스타면 비율 안으로 **가운데 크롭**).
   * src 는 object URL(파일) 또는 data URL(이미 처리한 이미지 — 채널을 인스타로 바꿀 때 다시 태운다).
   */
  async function toJpegDataUrl(src: string, forInstagram: boolean): Promise<string> {
    const img = await loadImage(src);
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (forInstagram && sw > 0 && sh > 0) {
      const ratio = sw / sh;
      if (ratio < IG_MIN_RATIO) {
        /* 너무 세로 — 위아래를 잘라 4:5 로 */
        sh = Math.round(sw / IG_MIN_RATIO);
        sy = Math.round((img.naturalHeight - sh) / 2);
      } else if (ratio > IG_MAX_RATIO) {
        /* 너무 가로 — 좌우를 잘라 1.91:1 로 */
        sw = Math.round(sh * IG_MAX_RATIO);
        sx = Math.round((img.naturalWidth - sw) / 2);
      }
    }
    const scale = Math.min(1, MAX_DIMENSION / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    /* JPEG 엔 알파가 없다 — PNG 투명 영역이 검게 구워지지 않게 흰 바탕을 먼저 깐다 */
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    /* 장당 상한 — 고엔트로피 원본이 크게 구워지면 한 단계 낮춰 다시(아래 합산 가드와 짝) */
    return out.length > 1_400_000 ? canvas.toDataURL("image/jpeg", 0.72) : out;
  }

  async function fileToJpegDataUrl(file: File, forInstagram: boolean): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
      return await toJpegDataUrl(url, forInstagram);
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
        const dataUrl = await fileToJpegDataUrl(f, channel === "instagram");
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
    (mode !== "schedule" || when >= earliestAt) &&
    !saving;

  /* 채널을 바꾸면 이미 쓴 내용이 소급해 무효가 될 수 있다(인스타 1000자 → 스레드 500자,
     스레드 글 전용 → 인스타 이미지 필수). 예전엔 저장 버튼만 조용히 꺼져서 **왜 막혔는지
     화면 어디에도 없었다** — 특히 이미지 쪽은 빨개지는 것조차 없었다(2026-08-31 점검 적발). */
  function switchChannel(next: string) {
    setChannel(next);
    const r = channelRules(next);
    const name = channelLabel(next);
    /* 스레드로 고른 사진을 인스타로 옮기면 비율 한계(4:5~1.91:1)를 다시 적용해야 한다 — 이미 처리한 data URL 을 다시 태운다 */
    if (next === "instagram" && channel !== "instagram" && images.length > 0) {
      void Promise.all(images.map((src) => toJpegDataUrl(src, true).catch(() => src))).then((fitted) =>
        setImages((prev) => (prev.length === fitted.length ? fitted : prev)),
      );
    }
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
      const res = await createPost({ channel, caption: caption.trim(), images, mode, when });
      if (!res.ok) {
        setError(res.error ?? "저장하지 못했어요.");
        return;
      }
      const label = channelLabel(channel);
      if (res.mode === "now") {
        onSaved(
          res.outcome.published
            ? { tone: "positive", title: `${label}에 올라갔어요`, description: "「발행완료」 탭에서 확인할 수 있어요." }
            : /* 저장은 됐고 발행만 실패 — 컴포저를 닫는다. 열어 둔 채 오류만 보이면 같은 글을 두 번 올리게 된다 */
              {
                tone: "negative",
                title: `${label}에 올리지 못했어요`,
                description: `${res.outcome.error} — 글은 「발행예약」 탭에 남아 있어요. 다시 시도하거나 지울 수 있어요.`,
              },
        );
      } else if (res.mode === "draft") {
        onSaved({ tone: "positive", title: "초안으로 저장했어요", description: "「초안」 탭에서 언제든 시각을 정하거나 지금 발행할 수 있어요." });
      } else {
        onSaved({ tone: "positive", title: `${label} 발행을 예약했어요`, description: `${formatWhen(when)}부터 5분 안에 자동으로 올라가요.` });
      }
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
            <ButtonLink href="/settings/channels">연동하러 가기</ButtonLink>
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
                const meta = channels?.find((c) => c.channel === ch);
                const publishable = isPublishableChannel(ch); // 발행 어댑터가 있는 채널만
                /* channels === null 은 «확인 못 함» — 고르는 것까지 막지 않는다. 저장 시 서버가 다시 판정한다 */
                const usable = publishable && (isDemo || channels === null || !!meta?.connected);
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

          {/* 발행 방식 — 셋 다 실제로 되는 것만 둔다(2026-09-09 «지금 발행» 개통) */}
          <div>
            <p className="text-[12px] font-medium text-fg-sub">발행 방식</p>
            <div className="mt-1.5 space-y-1.5" role="radiogroup" aria-label="발행 방식">
              <label
                className={cn(
                  "flex cursor-pointer flex-wrap items-center gap-2.5 rounded-card border px-3.5 py-2.5",
                  mode === "now" ? "border-2 border-primary" : "border-line hover:bg-tint-hover",
                )}
              >
                <input
                  type="radio"
                  name="pc-mode"
                  checked={mode === "now"}
                  onChange={() => setMode("now")}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span className="text-[15px] font-medium">지금 발행</span>
                <span className="w-full text-[12px] text-fg-sub">저장하자마자 바로 올라가요. 올라간 뒤엔 여기서 되돌릴 수 없어요.</span>
              </label>

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
                    type="datetime-local"
                    min={earliestAt}
                    step={300}
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    aria-label="발행 시각"
                    className="tnum h-9 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
                  />
                ) : null}
                <span className="w-full text-[12px] text-fg-sub">예약한 시각부터 5분 안에 자동으로 올라가요.</span>
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
                <span className="text-[12px] text-fg-sub">시각은 나중에 정해요.</span>
              </label>
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
            {saving
              ? mode === "now"
                ? "발행 중…"
                : "저장 중…"
              : mode === "draft"
                ? "초안으로 저장"
                : mode === "now"
                  ? "지금 발행하기"
                  : "예약하기"}
          </Button>
          {/* 메타가 이미지를 처리하는 시간 — 캐러셀은 1분 가까이 걸리기도 한다. 말없이 돌면 멈춘 줄 안다 */}
          {saving && mode === "now" ? (
            <p className="mt-2 text-center text-[12px] text-fg-sub">
              {channelLabel(channel)}이 이미지를 처리하는 동안 잠시 걸릴 수 있어요. 창을 닫지 마세요.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** "YYYY-MM-DDTHH:mm" → "9월 10일 09:00" — 결과 모달 문장용 */
function formatWhen(value: string): string {
  const [d, t] = value.split("T");
  if (!d || !t) return value;
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${t}`;
}
