"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { FinchMark } from "@/components/logo";
import { SnsIcon } from "@/components/sns-brand-icons";
import { initialOf, youtubeEmbed } from "@/lib/links";
import { Collapsible } from "@/app/p/[slug]/_components/collapsible";
import { fontStylesheets, themeByKey, themeVars, SNS_KINDS } from "@/lib/links/themes";
import { useFontStylesheets } from "./use-font-stylesheets";
import {
  BLOCK_CATALOG,
  blockSummary,
  COUPANG_DISCLOSURE,
  emphasizedCta,
  hiddenReason,
  isScheduledHidden,
  musicEmbed,
  partialReason,
  scheduleCaption,
  type LinkBlock,
} from "@/lib/links/blocks";
import type { LinkPageView } from "@/lib/links/types";

/*
  라이브 미리보기 — 링크팜의 우측 폰 프레임에 해당.

  ⚠️ 공개 페이지(app/p/[slug])의 BlockRenderer 를 **재사용하지 않는다.** 그쪽은 서버
  컴포넌트이고 링크가 /p/{slug}/go/... 로 나가서, 미리보기에서 누르면 집계가 오염되고
  편집 화면을 떠난다. 여기서는 **시각 복제**만 만들고, 누르면 그 블록의 편집기를 연다
  (링크팜의 미리보기 호버 툴바가 주는 실익 대부분이 이것이다).

  색·모서리·그림자는 같은 테마 토큰(--lp-*)에서 온다.

  ⚠️⚠️ **숨김 규칙은 공개 렌더러와 같아야 한다.** 앞서는 여기서만 회색 자리표시자를
  그려서, 이미지 없는 이미지 블록·주소 없는 링크가 미리보기에는 멀쩡히 보이고 발행하면
  사라졌다. 지금은 lib/links/blocks.ts 의 hiddenReason() 한 곳이 그 판정을 하고,
  편집 캔버스는 **블록의 실제 모습 + 아래 한 줄 사유 캡션**으로 말한다(2026-08-20
  개편 — 유령칸 문장 상자는 빈 블록이 연달아 있으면 캔버스를 도배했다). 그릴 것이
  아예 없는 블록(이미지 없음·항목 0개)만 초대 문구 유령칸으로 남는다.
  아무것도 안 그리면 편집 중 블록이 사라진 것처럼 보이고, 멀쩡하게 그리면서 사유를
  숨기면 거짓말이다 — 모습과 사유를 둘 다 보여준다.

  타이포가 앱 스케일(11·12·14·15·17·20·28)을 안 따르는 이유: 이건 **공개 페이지를
  축소한 목업**이지 앱 UI 가 아니다. 실제 페이지의 15px 본문이 380px 폭 프레임 안에서
  15px 이면 비율이 깨진다.
*/

const s = (d: Record<string, unknown>, k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
const n = (d: Record<string, unknown>, k: string, fb: number) => (typeof d[k] === "number" ? (d[k] as number) : fb);
const arr = (d: Record<string, unknown>, k: string) =>
  Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : [];

const card = "rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] shadow-[var(--lp-shadow)]";

/** 강조 태그 칩 — 공개 렌더러와 같은 모양(프레임 비율) */
function PTags({ d, align = "center", inherit = false }: { d: Record<string, unknown>; align?: "center" | "start"; inherit?: boolean }) {
  const tags = Array.isArray(d.tags) ? (d.tags as unknown[]).filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 3) : [];
  if (!tags.length) return null;
  return (
    <span className={`mt-1 flex flex-wrap gap-1 ${align === "start" ? "justify-start" : "justify-center"}`}>
      {tags.map((t) => (
        <span
          key={t}
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${inherit ? "" : "text-[var(--lp-accent-text)]"}`}
          style={{ backgroundColor: inherit ? "color-mix(in srgb, currentColor 16%, transparent)" : "color-mix(in srgb, var(--lp-accent) 14%, transparent)" }}
        >
          #{t}
        </span>
      ))}
    </span>
  );
}
function PPrice({ d }: { d: Record<string, unknown> }) {
  const price = s(d, "price");
  if (!price) return null;
  const orig = s(d, "originalPrice");
  return (
    <span className="tnum mt-0.5 flex items-baseline gap-1 text-[12px]">
      <span className="font-bold">{price}</span>
      {orig ? <span className="text-[10px] opacity-70 line-through">{orig}</span> : null}
    </span>
  );
}

const SNS_LABEL = new Map<string, string>(SNS_KINDS.map((k) => [k.key, k.label]));

/** 캔버스 직접 편집 콜백 — 넘기면 draft 미리보기가 편집기가 된다(링크팜 캔버스, 2026-08-20) */
export type CanvasEdit = {
  onEdit: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onMove: (id: string, dir: "up" | "down", label: string) => void;
  /** 드래그 드롭 — beforeId 앞으로(null 은 맨 뒤). label 은 끌던 블록 요약 */
  onReorder: (id: string, beforeId: string | null, label: string) => void;
  onDelete: (id: string, label: string) => void;
  onAdd: () => void;
  /** 아바타·커버 클릭 — 사진·레이아웃은 폼이 필요해서 드로어를 연다 */
  onOpenProfile: () => void;
  /** 이름·소개 인라인 편집 확정 — 그 자리에서 저장까지 간다 */
  onProfileCommit: (patch: { title?: string; bio?: string }) => void;
};

export function PhonePreview({
  page,
  blocks,
  selectedId,
  mode = "draft",
  frame = "fluid",
  edit,
}: {
  page: LinkPageView;
  blocks: LinkBlock[];
  selectedId: string | null;
  /**
   * draft: 편집 중인 초안 — 숨김 블록은 "공개 안 됨" 유령칸으로, 클릭하면 편집.
   * live: 마지막 발행본 — 공개 페이지와 똑같이 숨김 블록을 **아예 안 그리고**,
   *       클릭도 없다(발행본은 여기서 고칠 수 있는 것이 아니다).
   */
  mode?: "draft" | "live";
  /**
   * fluid: 칸 너비를 채우고 내용만큼 길어진다(최대 680px) — 편집 캔버스·템플릿 모달.
   * device: **실제 폰 크기(375×812)로 고정** — 우측 라이브 미리보기(2026-08-22 지시
   *         "핸드폰 크기로 고정"). 블록이 몇 개든 프레임은 같고 내용은 안에서 스크롤된다.
   *         짧은 화면에선 높이만 뷰포트에 맞춰 줄고 너비는 그대로다.
   */
  frame?: "fluid" | "device";
  /** 있으면 캔버스 직접 편집 — 블록 툴바·이름/소개 인라인 편집·블록 추가가 켜진다 */
  edit?: CanvasEdit;
}) {
  const theme = themeByKey(page.theme);
  useFontStylesheets(fontStylesheets(page.themeCustom?.font));
  const align =
    page.align === "left" ? "items-start text-left" : page.align === "right" ? "items-end text-right" : "items-center text-center";

  /* 이름·소개 인라인 편집 — 연필을 누르면 그 자리가 입력창이 된다.
     Enter/포커스 이탈로 확정, Escape 로 취소. 확정은 onProfileCommit 이 저장까지 간다. */
  const [inlineField, setInlineField] = useState<null | "title" | "bio">(null);
  /* 드래그 정렬 상태 — HTML5 DnD(터치는 툴바 ↑↓ 가 맡는다) */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /* live↔draft 토글은 리마운트가 아니다(같은 위치·같은 타입) — 드래그 도중 소스
     노드가 사라지면 dragend 가 안 와 상태가 박제될 수 있어 모드 전환에서 리셋한다 */
  const [prevMode, setPrevMode] = useState(mode);
  if (prevMode !== mode) {
    setPrevMode(mode);
    setDraggingId(null);
    setOverId(null);
  }
  function dropOn(beforeId: string | null) {
    if (draggingId && edit) {
      /* 화면이 그리는 목록(visible)에서 찾는다 — blocks 와 갈라지는 날이 와도
         보이지 않는 블록을 조용히 움직이지 않는다 */
      const dragged = visible.find((b) => b.id === draggingId);
      if (dragged && draggingId !== beforeId) edit.onReorder(draggingId, beforeId, blockSummary(dragged.type, dragged.data));
    }
    setDraggingId(null);
    setOverId(null);
  }
  const [inlineText, setInlineText] = useState("");
  function startInline(f: "title" | "bio") {
    setInlineField(f);
    setInlineText(f === "title" ? page.title : page.bio);
  }
  function commitInline() {
    if (!inlineField || !edit) return setInlineField(null);
    const v = inlineText.trim();
    /* 제목은 비울 수 없다(공개 페이지 머리가 사라진다) — 빈 확정은 취소로 처리 */
    if (inlineField === "title") {
      if (v && v !== page.title) edit.onProfileCommit({ title: v });
    } else if (v !== page.bio) {
      edit.onProfileCommit({ bio: v });
    }
    setInlineField(null);
  }
  const inlineKeys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && inlineField === "title") (e.target as HTMLElement).blur();
    /* 한글 조합 중 Escape 는 조합 취소다 — 편집 전체를 닫아버리면 안 된다 */
    if (e.key === "Escape" && !e.nativeEvent.isComposing) setInlineField(null);
  };

  const editable = mode !== "live" && !!edit;
  /* live 는 공개 렌더러가 숨기는 블록을 **여기서도 뺀다**. draft 는 전부 그린다 —
     캔버스 편집에선 꺼진(active=false) 블록도 흐리게 그려야 다시 켤 수 있다. */
  const visible = mode === "live" ? blocks.filter((b) => !hiddenReason(b.type, b.data) && !isScheduledHidden(b.data)) : blocks;
  /* 강조 블록(하단 고정 CTA) — 공개 페이지와 같은 규칙. 꺼진·예약 숨김 블록은 후보가 아니다 */
  const emphasized = (() => {
    for (const b of visible) {
      if (!b.active || isScheduledHidden(b.data)) continue;
      const cta = emphasizedCta(b.type, b.data);
      if (cta) return { block: b, cta };
    }
    return null;
  })();
  /* 공개 페이지의 20/24/30px 를 380px 프레임 비율로 줄인 값 */
  const titlePx = page.titleSize === "sm" ? "text-[16px]" : page.titleSize === "lg" ? "text-[24px]" : "text-[19px]";
  const snsChips =
    page.snsLinks.length > 0 ? (
      <div className={cn("flex flex-wrap gap-1.5", page.snsPlacement === "links" ? "mb-2.5 justify-center" : "mt-2.5")}>
        {page.snsLinks.map((x, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] px-2.5 py-1 text-[11px] font-medium"
          >
            {/* 공개 페이지와 같은 아이콘+한글 라벨 — 미리보기와 실제가 어긋나면 안 된다 */}
            <SnsIcon kind={x.kind} className="size-3 shrink-0" />
            {SNS_LABEL.get(x.kind) ?? x.kind}
          </span>
        ))}
      </div>
    ) : null;

  /* 인라인 연필 — 테마색을 따라가고, 정렬이 왼/오른쪽이어도 텍스트 옆에 붙는다 */
  const pencilBtn = (f: "title" | "bio", label: string) =>
    editable ? (
      <button
        type="button"
        onClick={() => startInline(f)}
        aria-label={label}
        className="trans-state ml-1 inline-flex rounded-full p-0.5 align-middle text-[var(--lp-muted)] hover:text-[var(--lp-fg)]"
      >
        <Pencil className="size-3" aria-hidden />
      </button>
    ) : null;

  const avatar =
    page.layout !== "cover" ? (
      page.avatarPath ? (
        // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
        <img
          src={page.avatarPath}
          alt=""
          className="mb-2.5 size-16 rounded-full border-2 border-[var(--lp-card)] object-cover shadow-[var(--lp-shadow)]"
        />
      ) : (
        /* 사진이 없으면 이니셜 원 — 공개 페이지와 **같은 변수**로 그린다. 프리셋 원본(theme.card)을
           쓰면 직접 꾸미기 색이 여기만 빠져 발행본과 머리 색이 달라진다(감사 #25). */
        <span
          className="mb-2.5 flex size-16 items-center justify-center rounded-full border-2 border-[var(--lp-card)] bg-[var(--lp-card)] text-[20px] font-bold text-[var(--lp-muted)] shadow-[var(--lp-shadow)]"
          aria-hidden
        >
          {initialOf(page.title || page.slug)}
        </span>
      )
    ) : null;

  return (
    <div className={cn("mx-auto", frame === "device" ? "w-[375px] max-w-full" : "w-full max-w-[410px]")}>
      {/* 폰 프레임 — device 는 프레임(테두리 6px 포함) 자체가 375×812 */}
      <div
        className={cn(
          "overflow-hidden rounded-[32px] border-[6px] border-fg/15 bg-plate shadow-pop",
          /* 14rem = 상단바 56 + sticky 오프셋 16 + 카드 패딩·테두리 34 + 제목줄 32 + 캡션 2줄 38
             + 간격 24 ≈ 200px 에 여유 24px — 짧은 화면에서 프레임 아래가 잘리지 않는다 */
          frame === "device" && "flex h-[812px] max-h-[calc(100dvh-14rem)] flex-col",
        )}
      >
        <div
          style={
            {
              ...themeVars(theme, page.themeCustom),
              fontFamily: "var(--lp-font)",
              cursor: "var(--lp-cursor)",
            } as React.CSSProperties
          }
          className={cn(
            "relative isolate overflow-hidden bg-[var(--lp-bg)] text-[var(--lp-fg)]",
            frame === "device" ? "flex min-h-0 flex-1 flex-col" : "",
          )}
          data-lp-fx={page.themeCustom?.effect && page.themeCustom.effect !== "none" ? page.themeCustom.effect : undefined}
          data-lp-anim={page.themeCustom?.anim && page.themeCustom.anim !== "none" ? page.themeCustom.anim : undefined}
        >
          {/* 배경 이미지·그라데이션 — 공개 페이지(page.tsx)와 같은 **프레임에 고정된 한 겹 + 블러**. 스크롤 컨테이너에
              직접 깔면 배경 필터(블러)가 안 먹어 편집기에선 선명한데 방문자에겐 흐린 사진이 나갔다(감사 L13) */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-4 -z-10 bg-[var(--lp-bg)] bg-cover bg-center"
            style={{ backgroundImage: "var(--lp-bg-image)", filter: "blur(var(--lp-bg-blur))" }}
          />
        <div
          className={cn("relative overflow-y-auto px-5 pb-10 pt-8", frame === "device" ? "min-h-0 flex-1" : "max-h-[680px]")}
        >
          {/* 상단 메뉴 줄 / 모서리 공유·구독 버튼 — 공개 페이지와 같은 자리(모양만, 동작 없음) */}
          {page.themeCustom?.topbar === "bar" ? (
            <div className="sticky top-0 z-20 -mx-5 -mt-8 mb-4 flex items-center gap-2 border-b border-[var(--lp-border)] px-4 py-2 backdrop-blur" style={{ backgroundColor: "color-mix(in srgb, var(--lp-bg) 88%, transparent)" }} aria-hidden>
              {page.avatarPath ? (
                // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
                <img src={page.avatarPath} alt="" className="size-6 rounded-full object-cover" />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{page.title || "제목"}</span>
              {page.themeCustom?.subscribe && blocks.some((b) => b.type === "subscribe") ? (
                <span className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--lp-accent)] px-2.5 text-[11px] font-semibold text-[var(--lp-on-accent)]">✉ 구독</span>
              ) : null}
              {page.themeCustom?.share ? (
                <span className="flex size-7 items-center justify-center rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] text-[var(--lp-fg)]">
                  <Share2 className="size-3" />
                </span>
              ) : null}
            </div>
          ) : (
            <>
              {page.themeCustom?.share ? (
                <span
                  aria-hidden
                  className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] text-[var(--lp-fg)] shadow-[var(--lp-shadow)]"
                >
                  <Share2 className="size-3.5" />
                </span>
              ) : null}
              {page.themeCustom?.subscribe && blocks.some((b) => b.type === "subscribe") ? (
                <span aria-hidden className="absolute left-3 top-3 inline-flex h-8 items-center gap-1 rounded-full bg-[var(--lp-accent)] px-3 text-[11px] font-semibold text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)]">
                  ✉ 구독
                </span>
              ) : null}
            </>
          )}
          {page.themeCustom?.logoImage && (page.themeCustom.logoPos ?? "bottom") === "top" ? (
            // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
            <img src={page.themeCustom.logoImage} alt="" className="mx-auto mb-4 max-h-10 max-w-[160px] object-contain" />
          ) : null}
          {/* 커버 — 캔버스 편집에선 눌러서 프로필 설정(사진 교체)으로 */}
          {(page.layout === "cover" || page.layout === "cover_profile") && page.coverPath ? (
            editable ? (
              <button type="button" onClick={edit?.onOpenProfile} aria-label="커버 이미지 바꾸기" className="mb-3 block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL */}
                <img src={page.coverPath} alt="" className="aspect-[3/1] w-full rounded-[var(--lp-radius)] object-cover" />
              </button>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
              <img src={page.coverPath} alt="" className="mb-3 aspect-[3/1] w-full rounded-[var(--lp-radius)] object-cover" />
            )
          ) : null}

          {/* 프로필 */}
          <div className={`flex flex-col ${align}`}>
            {editable && page.layout !== "cover" ? (
              <button type="button" onClick={edit?.onOpenProfile} aria-label="프로필 사진·레이아웃 설정">
                {avatar}
              </button>
            ) : (
              avatar
            )}

            {editable && inlineField === "title" ? (
              <input
                autoFocus
                value={inlineText}
                maxLength={40}
                onChange={(e) => setInlineText(e.target.value)}
                onBlur={commitInline}
                onKeyDown={inlineKeys}
                aria-label="페이지 이름"
                style={{ textAlign: "inherit" }}
                className={cn(
                  "w-full rounded-[8px] border border-[var(--lp-accent)] bg-[var(--lp-card)] px-2 py-1 font-bold leading-[1.3] outline-none",
                  titlePx,
                )}
              />
            ) : (
              <p className={cn("font-bold leading-[1.3]", titlePx)}>
                {page.title || page.slug}
                {pencilBtn("title", "이름 바로 고치기")}
              </p>
            )}

            {editable && inlineField === "bio" ? (
              <textarea
                autoFocus
                value={inlineText}
                rows={2}
                maxLength={160}
                onChange={(e) => setInlineText(e.target.value)}
                onBlur={commitInline}
                onKeyDown={inlineKeys}
                aria-label="소개"
                style={{ textAlign: "inherit" }}
                className="mt-1.5 w-full resize-none rounded-[8px] border border-[var(--lp-accent)] bg-[var(--lp-card)] px-2 py-1 text-[13px] leading-[1.6] outline-none"
              />
            ) : page.bio ? (
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[1.6] text-[var(--lp-muted)]">
                {page.bio}
                {pencilBtn("bio", "소개 바로 고치기")}
              </p>
            ) : editable ? (
              /* 소개가 비어 있으면 링크팜처럼 자리 문구를 그려서 "여기 눌러 쓰면 된다"를 보여준다 */
              <button
                type="button"
                onClick={() => startInline("bio")}
                className="trans-state mt-1.5 inline-flex items-center gap-1 text-[13px] text-[var(--lp-muted)] hover:text-[var(--lp-fg)]"
              >
                소개를 추가하세요
                <Pencil className="size-3" aria-hidden />
              </button>
            ) : null}
            {page.snsPlacement !== "links" ? snsChips : null}
          </div>

          {/* 블록 — snsPlacement=links 면 SNS 줄이 블록 목록 맨 위로 온다 */}
          <div className="mt-6 space-y-2.5">
            {page.snsPlacement === "links" ? snsChips : null}
            {visible.length === 0 && !editable ? (
              <p className="text-center text-[13px] text-[var(--lp-muted)]">
                {mode === "live" ? "라이브에 보이는 블록이 없어요." : "블록을 추가하면 여기에 보여요."}
              </p>
            ) : mode === "live" ? (
              visible.map((b) => (
                <div key={b.id} className="lp-block">
                  <PreviewBlock block={b} mode="live" />
                </div>
              ))
            ) : editable && edit ? (
              visible.map((b, i) => {
                const label = blockSummary(b.type, b.data);
                const hidden = hiddenReason(b.type, b.data);
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "lp-block group relative",
                      /* !important — 스크롤 애니메이션(animation) 이 일반 선언의 opacity 를 이긴다(감사2 U11) */
                      draggingId === b.id && "!opacity-50",
                      /* 드롭 대상 표시 — 선택(실선)과 헷갈리지 않게 점선 */
                      overId === b.id && draggingId && draggingId !== b.id && "outline-dashed outline-2 outline-primary",
                    )}
                    onDragOver={(e) => {
                      if (draggingId && draggingId !== b.id) {
                        e.preventDefault();
                        setOverId(b.id);
                      }
                    }}
                    onDragLeave={() => setOverId((v) => (v === b.id ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropOn(b.id);
                    }}
                  >
                    {/* 블록 툴바 — **기본 숨김.** 상시로 띄우면 짧은 블록이 연달아
                        쌓인 화면에서 위 블록 내용을 pills 가 덮는다(2026-08-20 실계정
                        스크린샷 지적). 그 블록에 호버/포커스했거나 편집 중일 때만,
                        한 번에 하나만 뜬다. 터치는 탭=편집기라 툴바 없이도 기능이 닿고,
                        편집 중(선택) 블록엔 항상 떠서 터치에서도 이동·노출·삭제가 된다.
                        스크림 배경이라 어떤 테마 위에서도 보인다. */}
                    <div
                      className={cn(
                        "absolute -top-3.5 right-2 z-20 flex items-center rounded-chip bg-scrim px-1 py-0.5",
                        "trans-state opacity-0 pointer-events-none",
                        "group-hover:pointer-events-auto group-hover:opacity-100",
                        "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                        selectedId === b.id && "pointer-events-auto opacity-100",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => edit.onEdit(b.id)}
                        aria-label={`${label} 편집`}
                        className="trans-state rounded-full p-1 text-on-scrim/85 hover:text-on-scrim"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                      {/* 경계에서 disabled 로 바꾸면 방금 누른 버튼이 그 자리에서 포커스를 잃고(Chrome)
                          툴바(group-focus-within)까지 사라진다 — aria-disabled + 가드로(감사 #13) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (i === 0) return;
                          edit.onMove(b.id, "up", label);
                        }}
                        aria-disabled={i === 0}
                        aria-label={`${label} 위로`}
                        className="trans-state rounded-full p-1 text-on-scrim/85 hover:text-on-scrim aria-disabled:cursor-default aria-disabled:opacity-30"
                      >
                        <ArrowUp className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (i === visible.length - 1) return;
                          edit.onMove(b.id, "down", label);
                        }}
                        aria-disabled={i === visible.length - 1}
                        aria-label={`${label} 아래로`}
                        className="trans-state rounded-full p-1 text-on-scrim/85 hover:text-on-scrim aria-disabled:cursor-default aria-disabled:opacity-30"
                      >
                        <ArrowDown className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => edit.onToggle(b.id, !b.active)}
                        aria-pressed={b.active}
                        aria-label={`${label} ${b.active ? "숨기기" : "노출하기"}`}
                        className="trans-state rounded-full p-1 text-on-scrim/85 hover:text-on-scrim"
                      >
                        {b.active ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                      </button>
                      <button
                        type="button"
                        onClick={() => edit.onDelete(b.id, label)}
                        aria-label={`${label} 삭제`}
                        className="trans-state rounded-full p-1 text-on-scrim/85 hover:text-negative"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                      {/* 드래그 핸들 — 버튼째 끌면 클릭 편집과 충돌해서 핸들만 draggable.
                          터치·키보드는 ↑↓ 가 같은 일을 한다. */}
                      {/* 마우스 전용 — role/label 을 주면 스크린리더에 "버튼"이라
                          선언되는데 키보드로는 아무것도 못 한다(거짓 어포던스,
                          소넷 확정 3). 키보드·터치의 순서 변경은 ↑↓ 가 맡는다. */}
                      <span
                        draggable
                        aria-hidden="true"
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", b.id);
                          setDraggingId(b.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setOverId(null);
                        }}
                        className="cursor-grab rounded-full p-1 text-on-scrim/85 hover:text-on-scrim active:cursor-grabbing"
                      >
                        <GripVertical className="size-3.5" aria-hidden />
                      </span>
                    </div>

                    {/* 꺼진 블록 표식 — **항상** 보인다. 캡션만으로는 공개 사유에 밀려 안 보였고
                        눈 아이콘은 호버해야 나와서, 블록 4개를 꺼 놓고도 "미리보기에 왜 안 나오냐"가
                        됐다(2026-08-22 실계정). 투명도는 쓰지 않는다 — 칩 + 점선 테두리로만. */}
                    {!b.active ? (
                      <span className="absolute -top-2.5 left-2 z-10 rounded-chip bg-scrim px-1.5 py-0.5 text-[10px] font-semibold text-on-scrim">
                        숨김
                      </span>
                    ) : b.data.emphasized === true ? (
                      <span className="absolute -top-2.5 left-2 z-10 rounded-chip bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-on-primary">
                        ★ 강조
                      </span>
                    ) : null}
                    <button
                      type="button"
                      id={`blk-${b.id}`}
                      onClick={() => edit.onEdit(b.id)}
                      aria-label={`${BLOCK_CATALOG.find((c) => c.type === b.type)?.label ?? b.type} · ${label}${b.active ? "" : " (숨김)"} 편집`}
                      className={cn(
                        "trans-state block w-full rounded-[calc(var(--lp-radius)+4px)] text-left outline-offset-2",
                        selectedId === b.id && "outline outline-2 outline-primary",
                        /* 꺼진 블록도 **제 색 그대로** 그린다 — 투명도를 깔면 파스텔 테마에서
                           물 빠진 렌더링 버그처럼 읽힌다(2026-08-20 실계정 지적 "왜 흐릿하게").
                           대신 점선 테두리로 "지금은 빠져 있다"를 말한다. */
                        !b.active && selectedId !== b.id && "outline-dashed outline-1 outline-[var(--lp-muted)]",
                      )}
                    >
                      <PreviewBlock block={b} mode="edit" />
                    </button>
                    {/* 상태 캡션 — 공개 안 되는 사유(주소 없음 등) 또는 숨김을 블록 아래
                        10px 한 줄로. 유령칸 문장 상자 도배(2026-08-20 실계정 지적)의
                        대체다. 둘 다면 사유 우선 — 같은 "안 나감"을 두 번 말하지 않는다. */}
                    {!b.active ? (
                      /* 숨김이 사유보다 먼저 — 사용자가 직접 끈 것이라 그걸 먼저 알아야 되돌린다.
                         사유가 같이 있으면 한 줄에 이어 쓴다(같은 "안 나감"을 두 줄로 말하지 않는다). */
                      <p className="mt-1 text-center text-[10px] text-[var(--lp-muted)]">
                        숨김 — 미리보기·공개에 안 나가요 · 눈 아이콘으로 켜기{hidden ? ` · ${hidden}` : ""}
                      </p>
                    ) : scheduleCaption(b.data) ? (
                      <p className="mt-1 text-center text-[10px] text-[var(--lp-muted)]">{scheduleCaption(b.data)}</p>
                    ) : hidden ? (
                      <p className="mt-1 text-center text-[10px] text-[var(--lp-muted)]">{hidden}</p>
                    ) : partialReason(b.type, b.data) ? (
                      /* 항목 일부만 주소가 없는 가로 카드·그리드 — 발행본에선 그 칸만 빠진다(감사 #17) */
                      <p className="mt-1 text-center text-[10px] text-[var(--lp-muted)]">{partialReason(b.type, b.data)}</p>
                    ) : null}
                  </div>
                );
              })
            ) : (
              /* 읽기 전용 초안(우측 「라이브 미리보기」) — 캔버스와 **같은 관대한 규칙**으로
                 그린다(주소 없는 블록도 모습 그대로, 도구·캡션만 없음). 공개 규칙(live)로
                 그리면 아직 주소를 안 넣은 블록이 통째로 빠져 "수정해도 미리보기에 안
                 나온다"로 보인다(2026-08-20 지적). 공개 여부는 캔버스 캡션·최신 칩이 말한다. */
              visible.map((b) => (
                <div key={b.id} className="lp-block">
                  <PreviewBlock block={b} mode="preview" />
                </div>
              ))
            )}

            {editable && edit ? (
              <button
                type="button"
                onClick={edit.onAdd}
                onDragOver={(e) => {
                  if (draggingId) {
                    e.preventDefault();
                    setOverId("__end__");
                  }
                }}
                onDragLeave={() => setOverId((v) => (v === "__end__" ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(null);
                }}
                className={cn(
                  "trans-state flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[var(--lp-radius)] border border-dashed border-[var(--lp-border)] text-[13px] font-semibold text-[var(--lp-muted)] hover:border-[var(--lp-accent)] hover:text-[var(--lp-accent)]",
                  overId === "__end__" && draggingId && "outline-dashed outline-2 outline-primary",
                )}
              >
                <Plus className="size-4" aria-hidden />
                {draggingId ? "여기 놓으면 맨 뒤로" : "블록 추가"}
              </button>
            ) : null}
          </div>

          {/* 핀치 배지 — 공개 페이지와 같은 자리·같은 모양(app/p/[slug]/page.tsx 와 짝).
              미리보기에선 누를 수 없는 표시만 — 편집 화면을 떠나면 안 된다. */}
          {page.themeCustom?.logoImage && (page.themeCustom.logoPos ?? "bottom") === "bottom" ? (
            // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
            <img src={page.themeCustom.logoImage} alt="" className="mx-auto mt-8 max-h-10 max-w-[160px] object-contain" />
          ) : null}
          {page.themeCustom?.badge === "hide" || page.themeCustom?.logoImage ? null : (
          <div className="mt-8 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--lp-muted)] shadow-[var(--lp-shadow)]">
              <FinchMark className="size-3 text-primary" />
              핀치에서 내 프로필 꾸미기
            </span>
          </div>
          )}

          {/* 강조 블록 하단 고정 CTA — 공개 페이지와 같은 모양·같은 자리(흐름 맨 뒤, 프레임 안 sticky) */}
          {emphasized ? (
            <div className="pointer-events-none sticky bottom-3 z-10 mt-4 flex justify-center">
              <span className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-5 text-[14px] font-bold text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)]">
                {emphasized.cta.label}
              </span>
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}

/** 이 상태로는 발행돼도 공개 페이지에 안 나온다는 표시 */
function Ghost({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-[44px] items-center justify-center rounded-[var(--lp-radius)] border border-dashed border-[var(--lp-border)] px-3 py-2.5 text-center text-[12px] text-[var(--lp-muted)]">
      {reason}
    </div>
  );
}

/*
  mode — live: 공개 규칙(숨김은 아예 안 그림) · draft: 유령칸 · edit: 캔버스(관대, 회색 자리표시·사유 캡션)
       · preview: 우측 읽기 전용 미리보기 — edit 처럼 관대하게 실제 모습을 그리되 회색 자리표시(업로드 초대)는 없다(감사2 C1).
*/
function PreviewBlock({ block, mode = "draft" }: { block: LinkBlock; mode?: "draft" | "live" | "edit" | "preview" }) {
  const d = block.data ?? {};
  const lenient = mode === "edit" || mode === "preview";

  /* 공개 렌더러가 숨기는 조건과 **같은 함수**를 쓴다. live 는 부모가 이미 걸렀지만
     혹시 새 숨김 조건이 부모 필터를 놓쳐도 유령칸이 라이브에 새지 않게 한 번 더 막는다. */
  const hidden = hiddenReason(block.type, d);
  if (hidden) {
    if (mode === "live") return null;
    /* 편집 캔버스(edit)는 유령칸 대신 **블록의 실제 모습**을 그린다 — 빈 블록이
       연달아 있으면 사유 문장 상자가 캔버스를 도배한다(2026-08-20 실계정 지적).
       사유는 래퍼가 블록 아래 10px 한 줄 캡션으로 단다. 그릴 것이 아예 없는
       소수 케이스(이미지 없음·항목 0개)만 아래 case 에서 초대 문구로 떨어진다. */
    if (!lenient) return <Ghost reason={hidden} />;
  }

  switch (block.type) {
    case "link": {
      const emphasis = s(d, "emphasis") || "normal";
      /* 공개 렌더러와 같은 규칙 — 프레임 비율로 줄인 값(공개 13/15/17 → 12/13/15) */
      const textStyle: React.CSSProperties = {};
      const tSize = s(d, "textSize");
      if (tSize === "sm") textStyle.fontSize = "12px";
      else if (tSize === "lg") textStyle.fontSize = "15px";
      const tWeight = s(d, "textWeight");
      if (tWeight === "medium") textStyle.fontWeight = 500;
      else if (tWeight === "bold") textStyle.fontWeight = 700;
      if (/^#[0-9a-fA-F]{6}$/.test(s(d, "textColor"))) textStyle.color = s(d, "textColor");
      const layout = s(d, "layout") || "button";
      const thumb = s(d, "imagePath");
      if (layout === "small" || layout === "medium" || layout === "large") {
        const big = layout === "large";
        return (
          <div className={`lp-btn ${card} overflow-hidden ${big ? "" : "flex items-center gap-2.5 p-2.5"}`}>
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
              <img
                src={thumb}
                alt=""
                className={big ? "aspect-[16/9] w-full object-cover" : `${layout === "small" ? "size-10" : "size-16"} shrink-0 rounded-[calc(var(--lp-radius)/1.6)] object-cover`}
              />
            ) : !big && mode === "edit" ? (
              /* 회색 칸은 캔버스의 "여기 사진 넣으세요" 초대다 — 공개 페이지는 안 그리므로 읽기 전용 미리보기에도 안 그린다(감사 L12) */
              <span className={`${layout === "small" ? "size-10" : "size-16"} shrink-0 rounded-[calc(var(--lp-radius)/1.6)] bg-[var(--lp-border)]`} aria-hidden />
            ) : null}
            <span className={`min-w-0 flex-1 ${big ? "block px-3 py-2.5 text-center" : ""}`}>
              <span style={textStyle} className="block text-[13px] font-semibold">
                {s(d, "emoji") ? <span aria-hidden>{s(d, "emoji")} </span> : null}
                {s(d, "label") || "링크"}
              </span>
              <PPrice d={d} />
              <PTags d={d} align={big ? "center" : "start"} />
            </span>
          </div>
        );
      }
      const hasExtras = s(d, "price") || (Array.isArray(d.tags) && (d.tags as unknown[]).length > 0);
      return (
        <div
          style={textStyle}
          className={[
            "lp-btn flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--lp-radius-btn)] px-4 py-2.5 text-center text-[13px] font-semibold",
            hasExtras ? "flex-col gap-0.5" : "",
            emphasis === "primary"
              ? "bg-[var(--lp-accent)] text-[var(--lp-on-accent)]"
              : emphasis === "outline"
                ? "border-2 border-[var(--lp-accent)] text-[var(--lp-accent-text)]"
                : "border border-[var(--lp-btn-border)] bg-[var(--lp-btn-bg)] text-[var(--lp-btn-fg)] shadow-[var(--lp-shadow)]",
          ].join(" ")}
        >
          <span className="flex items-center gap-1.5">
            {s(d, "emoji") ? <span aria-hidden>{s(d, "emoji")}</span> : null}
            {s(d, "label") || "링크"}
          </span>
          {hasExtras ? (
            <span className="flex flex-col items-center">
              <PPrice d={d} />
              <PTags d={d} inherit />
            </span>
          ) : null}
        </div>
      );
    }
    case "heading":
      return <p className="pt-1 text-[15px] font-bold">{s(d, "text")}</p>;
    case "text":
      return (
        <p
          className="whitespace-pre-wrap text-[13px] leading-[1.7] text-[var(--lp-muted)]"
          style={{ textAlign: s(d, "align") === "center" ? "center" : "left" }}
        >
          {s(d, "text")}
        </p>
      );
    case "divider":
      return s(d, "style") === "dot" ? (
        <p className="text-center text-[var(--lp-muted)]">· · ·</p>
      ) : (
        <hr className="border-0 border-t border-[var(--lp-border)]" />
      );
    case "spacer":
      return <div style={{ height: n(d, "size", 24) }} />;
    case "image":
      /* edit 전용 도달 — 이미지가 없으면 초대 문구. 사유 캡션과 달리 "하면 된다"로 말한다 */
      if (!s(d, "imagePath")) return <Ghost reason="이미지를 올리면 여기 보여요" />;
      return (
        // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
        <img src={s(d, "imagePath")} alt="" className="w-full rounded-[var(--lp-radius)] object-cover" />
      );
    case "image_card":
      return (
        <div className={`${card} overflow-hidden`}>
          {s(d, "imagePath") ? (
            // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
            <img src={s(d, "imagePath")} alt="" className="aspect-[16/9] w-full object-cover" />
          ) : null}
          <div className="px-3 py-2.5">
            <p className="text-[13px] font-semibold">{s(d, "title")}</p>
            {s(d, "subtitle") ? <p className="mt-0.5 text-[12px] text-[var(--lp-muted)]">{s(d, "subtitle")}</p> : null}
            {s(d, "price") ? <p className="tnum mt-1.5 text-[15px] font-bold">{s(d, "price")}</p> : null}
            {s(d, "ctaLabel") && s(d, "url") ? (
              <span className="mt-2 flex min-h-[32px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-3 text-[12px] font-semibold text-[var(--lp-on-accent)]">
                {s(d, "ctaLabel")}
              </span>
            ) : null}
          </div>
        </div>
      );
    case "video": {
      /* 유튜브만 임베드된다. 그 밖의 주소는 공개 페이지가 "▶ 영상 보러 가기" 링크로
         떨어뜨리므로, 미리보기도 같은 모양이어야 한다(앞서는 늘 ▶ 상자였다).
         판정은 공개 렌더러와 **같은 함수**로 한다. */
      const isYoutube = !!youtubeEmbed(s(d, "url"));
      return isYoutube ? (
        <div className={`${card} flex aspect-video items-center justify-center text-[12px] text-[var(--lp-muted)]`}>
          ▶ {s(d, "title") || "유튜브 영상"}
        </div>
      ) : (
        <div className={`${card} flex min-h-[44px] items-center justify-center px-3 py-2.5 text-[13px] font-semibold`}>
          ▶ {s(d, "title") || "영상 보러 가기"}
        </div>
      );
    }
    case "card_row": {
      const items = arr(d, "items").filter((it) => lenient || s(it, "url"));
      if (lenient && items.length === 0) return <Ghost reason="항목을 추가해 주세요" />;
      if (s(d, "layout") === "carousel") {
        return (
          <div className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((it, i) => (
              <div key={i} className={`${card} w-[72%] shrink-0 snap-start overflow-hidden`}>
                {s(it, "imagePath") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
                  <img src={s(it, "imagePath")} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : mode === "edit" ? (
                  <span className="block aspect-[4/3] w-full bg-[var(--lp-border)]" aria-hidden />
                ) : null}
                <span className="block px-2.5 py-2">
                  <span className="block truncate text-[13px] font-semibold">{s(it, "title")}</span>
                  {s(it, "subtitle") ? <span className="block truncate text-[11px] text-[var(--lp-muted)]">{s(it, "subtitle")}</span> : null}
                  <PPrice d={it} />
                </span>
              </div>
            ))}
          </div>
        );
      }
      const nodes = items.map((it, i) => (
        <div key={i} className={`${card} flex items-center gap-2.5 p-2.5`}>
          {s(it, "imagePath") ? (
            // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
            <img src={s(it, "imagePath")} alt="" className="size-10 shrink-0 rounded-[calc(var(--lp-radius)/1.6)] object-cover" />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{s(it, "title")}</span>
            {s(it, "subtitle") ? <span className="block truncate text-[12px] text-[var(--lp-muted)]">{s(it, "subtitle")}</span> : null}
            <PPrice d={it} />
          </span>
        </div>
      ));
      /* 캔버스의 블록은 <button> 이라 그 안에 「더보기」 <button> 을 넣을 수 없다(무효 DOM·하이드레이션 불일치, 감사2 C8) — 캔버스에선 접지 않고 캡션으로 말한다 */
      return (
        <>
          <Collapsible items={nodes} initial={mode === "edit" ? 0 : n(d, "collapse", 0)} className="space-y-2" />
          {mode === "edit" && n(d, "collapse", 0) > 0 && arr(d, "items").filter((it) => s(it, "url")).length > n(d, "collapse", 0) ? (
            <p className="mt-1 text-center text-[10px] text-[var(--lp-muted)]">공개 페이지에선 처음 {n(d, "collapse", 0)}개만 보이고 「더보기」로 접혀요</p>
          ) : null}
        </>
      );
    }
    case "grid": {
      const items = arr(d, "items").filter((it) => lenient || s(it, "url"));
      if (lenient && items.length === 0) return <Ghost reason="항목을 추가해 주세요" />;
      const nodes = items.map((it, i) => (
        <div key={i} className={`${card} overflow-hidden`}>
          {s(it, "imagePath") ? (
            // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
            <img src={s(it, "imagePath")} alt="" className="aspect-square w-full object-cover" />
          ) : null}
          <span className="block px-2 py-1.5 text-center text-[12px] font-medium">
            {s(it, "title")}
            <PPrice d={it} />
          </span>
        </div>
      ));
      return (
        <>
          <Collapsible items={nodes} initial={mode === "edit" ? 0 : n(d, "collapse", 0)} className={`grid gap-2 ${n(d, "columns", 2) === 3 ? "grid-cols-3" : "grid-cols-2"}`} />
          {mode === "edit" && n(d, "collapse", 0) > 0 && arr(d, "items").filter((it) => s(it, "url")).length > n(d, "collapse", 0) ? (
            <p className="mt-1 text-center text-[10px] text-[var(--lp-muted)]">공개 페이지에선 처음 {n(d, "collapse", 0)}개만 보이고 「더보기」로 접혀요</p>
          ) : null}
        </>
      );
    }
    case "notice":
      return (
        <div
          className={[
            "rounded-[var(--lp-radius)] px-3 py-2.5 text-[12px] leading-[1.6]",
            s(d, "tone") === "primary" ? "bg-[var(--lp-accent)] text-[var(--lp-on-accent)]" : card,
          ].join(" ")}
        >
          {s(d, "text")}
        </div>
      );
    case "social_feed":
      return (
        <div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: n(d, "count", 6) }).map((_, i) => (
              <span
                key={i}
                className="block aspect-square rounded-[calc(var(--lp-radius)/1.6)] bg-[var(--lp-border)]"
                aria-hidden
              />
            ))}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-[var(--lp-muted)]">
            「라이브 반영」할 때 인스타그램 최근 게시물로 채워져요
          </p>
        </div>
      );
    case "contact":
    case "subscribe": {
      /* 공개 폼(lead-form.tsx)이 그리는 칸 수와 맞춘다 — 앞서는 항상 1칸이라
         "이름·이메일·내용 다 받겠다"고 설정해도 미리보기는 한 줄이었다. */
      const fields =
        block.type === "subscribe"
          ? ["email"]
          : Array.isArray(d.fields) && (d.fields as string[]).length > 0
            ? ["name", "email", "phone", "message"].filter((f) => (d.fields as string[]).includes(f))
            : ["name", "email", "message"];
      return (
        <div className={`${card} space-y-2 p-3`}>
          <p className="text-[13px] font-semibold">
            {s(d, "title") || (block.type === "subscribe" ? "새 소식 받기" : "문의하기")}
          </p>
          {s(d, "description") ? (
            <p className="text-[12px] leading-[1.6] text-[var(--lp-muted)]">{s(d, "description")}</p>
          ) : null}
          {fields.map((f) => (
            <span
              key={f}
              className={cn(
                "block rounded-[calc(var(--lp-radius)/1.6)] border border-[var(--lp-border)]",
                f === "message" ? "h-14" : "h-9",
              )}
              aria-hidden
            />
          ))}
          <span className="block h-9 rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)]" aria-hidden />
        </div>
      );
    }
    case "coupang":
      return (
        <div className={`${card} overflow-hidden`}>
          {s(d, "imagePath") ? (
            // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
            <img src={s(d, "imagePath")} alt="" className="aspect-[16/9] w-full object-cover" />
          ) : null}
          <div className="px-3 py-2.5">
            <span className="inline-block rounded-full bg-[var(--lp-accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--lp-on-accent)]">
              쿠팡 파트너스
            </span>
            <p className="mt-1 text-[13px] font-semibold">{s(d, "title") || "상품 이름"}</p>
            {s(d, "price") ? <p className="tnum mt-0.5 text-[15px] font-bold">{s(d, "price")}</p> : null}
            <span className="mt-2 flex min-h-[32px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-3 text-[12px] font-semibold text-[var(--lp-on-accent)]">
              쿠팡에서 보기
            </span>
            {/* 고지 — 공개 렌더러가 항상 붙이므로 미리보기도 그대로 보여야 발행 후 모양이 안 달라진다 */}
            <p className="mt-1.5 text-[9px] leading-[1.5] text-[var(--lp-muted)]">{COUPANG_DISCLOSURE}</p>
          </div>
        </div>
      );
    case "donation":
      return (
        <div>
          <div className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-4 py-2.5 text-center text-[13px] font-semibold text-[var(--lp-on-accent)]">
            {s(d, "emoji") ? <span aria-hidden>{s(d, "emoji")}</span> : null}
            {s(d, "label") || "후원하기"}
          </div>
          {s(d, "message") ? <p className="mt-1.5 text-center text-[11px] text-[var(--lp-muted)]">{s(d, "message")}</p> : null}
        </div>
      );
    case "map":
      return (
        <div className={`${card} px-3 py-2.5`}>
          <p className="text-[13px] font-semibold">{s(d, "label") || "찾아오시는 길"}</p>
          <p className="mt-0.5 text-[12px] text-[var(--lp-muted)]">{s(d, "address")}</p>
        </div>
      );

    /* ── 리틀리 흡수 4단계 블록 — 공개 렌더러(block-renderer.tsx)와 같은 모양(프레임 비율) ── */
    case "gallery": {
      const items = arr(d, "items").filter((it) => s(it, "imagePath"));
      if (items.length === 0) return <Ghost reason="사진을 올리면 여기 보여요" />;
      const layout = s(d, "layout") || "grid";
      const square = (s(d, "aspect") || "square") === "square";
      const img = (it: Record<string, unknown>, i: number) => (
        // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
        <img key={i} src={s(it, "imagePath")} alt="" className={`w-full rounded-[calc(var(--lp-radius)/1.6)] object-cover ${square ? "aspect-square" : ""}`} />
      );
      if (layout === "carousel" || layout === "slide") {
        return (
          <div className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((it, i) => (
              <div key={i} className={`${layout === "slide" ? "w-full" : "w-[78%]"} shrink-0 snap-center`}>
                {img(it, i)}
              </div>
            ))}
          </div>
        );
      }
      if (layout === "list") return <div className="space-y-2">{items.map(img)}</div>;
      if (layout === "masonry") return <div className="columns-2 gap-2 [&>*]:mb-2 [&>*]:break-inside-avoid">{items.map(img)}</div>;
      return <div className="grid grid-cols-3 gap-1.5">{items.map(img)}</div>;
    }
    case "music": {
      const em = musicEmbed(s(d, "url"));
      return (
        <div className={`${card} flex items-center gap-2.5 px-3 py-2.5`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--lp-accent)] text-[var(--lp-on-accent)]" aria-hidden>
            ♪
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{s(d, "title") || "음악"}</span>
            <span className="block text-[11px] text-[var(--lp-muted)]">
              {em ? `${em.provider === "spotify" ? "스포티파이" : em.provider === "soundcloud" ? "사운드클라우드" : "유튜브 뮤직"} 플레이어가 여기 들어가요` : "지원하는 주소를 넣으면 플레이어가 보여요"}
            </span>
          </span>
        </div>
      );
    }
    case "vcard":
      return (
        <div className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--lp-radius-btn)] border border-[var(--lp-btn-border)] bg-[var(--lp-btn-bg)] px-4 py-2.5 text-[13px] font-semibold text-[var(--lp-btn-fg)] shadow-[var(--lp-shadow)]">
          👤 {s(d, "label") || "연락처 저장"}
          {s(d, "name") ? <span className="text-[11px] font-normal text-[var(--lp-muted)]">· {s(d, "name")}</span> : null}
        </div>
      );
    case "search":
      return (
        <div className={`${card} flex min-h-[40px] items-center gap-2 px-3 text-[12px] text-[var(--lp-muted)]`}>
          🔍 {s(d, "placeholder") || "무엇을 찾으세요?"}
        </div>
      );
    case "file":
      if (!s(d, "url")) return <Ghost reason="파일을 올리면 여기 보여요" />;
      return (
        <div className={`${card} flex items-center gap-2.5 p-2.5`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[calc(var(--lp-radius)/1.6)] bg-[var(--lp-accent)] text-[var(--lp-on-accent)]" aria-hidden>
            ⤓
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{s(d, "title") || s(d, "fileName") || "파일"}</span>
            <span className="block truncate text-[11px] text-[var(--lp-muted)]">{[s(d, "description"), s(d, "fileName")].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
      );
    case "guestbook":
      return (
        <div className={`${card} p-3`}>
          <p className="text-[13px] font-semibold">{s(d, "title") || "방명록"}</p>
          <div className="mt-2 h-8 rounded-[var(--lp-radius)] border border-[var(--lp-border)]" aria-hidden />
          <div className="mt-1.5 h-14 rounded-[var(--lp-radius)] border border-[var(--lp-border)] px-2 py-1.5 text-[11px] text-[var(--lp-muted)]">{s(d, "placeholder") || "한마디 남겨 주세요"}</div>
          <div className="mt-1.5 flex h-8 items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] text-[12px] font-semibold text-[var(--lp-on-accent)]">남기기</div>
          <p className="mt-2 text-center text-[10px] text-[var(--lp-muted)]">방문자 글과 내 답글이 아래에 쌓여요</p>
        </div>
      );
    default:
      return null;
  }
}
