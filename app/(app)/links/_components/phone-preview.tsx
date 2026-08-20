"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { SnsIcon } from "@/components/sns-brand-icons";
import { initialOf, youtubeEmbed } from "@/lib/links";
import { themeByKey, themeVars, SNS_KINDS } from "@/lib/links/themes";
import { BLOCK_CATALOG, blockSummary, hiddenReason, type LinkBlock } from "@/lib/links/blocks";
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
  여기서는 **"이 상태로는 공개 안 됨"이라고 말하는 유령칸**을 그린다 —
  아무것도 안 그리면 편집 중 블록이 사라진 것처럼 보이고, 멀쩡하게 그리면 거짓말이다.

  타이포가 앱 스케일(11·12·14·15·17·20·28)을 안 따르는 이유: 이건 **공개 페이지를
  축소한 목업**이지 앱 UI 가 아니다. 실제 페이지의 15px 본문이 380px 폭 프레임 안에서
  15px 이면 비율이 깨진다.
*/

const s = (d: Record<string, unknown>, k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
const n = (d: Record<string, unknown>, k: string, fb: number) => (typeof d[k] === "number" ? (d[k] as number) : fb);
const arr = (d: Record<string, unknown>, k: string) =>
  Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : [];

const card = "rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] shadow-[var(--lp-shadow)]";

const SNS_LABEL = new Map<string, string>(SNS_KINDS.map((k) => [k.key, k.label]));

/** 캔버스 직접 편집 콜백 — 넘기면 draft 미리보기가 편집기가 된다(링크팜 캔버스, 2026-08-20) */
export type CanvasEdit = {
  onEdit: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onMove: (id: string, dir: "up" | "down", label: string) => void;
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
  onPick,
  mode = "draft",
  edit,
}: {
  page: LinkPageView;
  blocks: LinkBlock[];
  selectedId: string | null;
  onPick?: (id: string) => void;
  /**
   * draft: 편집 중인 초안 — 숨김 블록은 "공개 안 됨" 유령칸으로, 클릭하면 편집.
   * live: 마지막 발행본 — 공개 페이지와 똑같이 숨김 블록을 **아예 안 그리고**,
   *       클릭도 없다(발행본은 여기서 고칠 수 있는 것이 아니다).
   */
  mode?: "draft" | "live";
  /** 있으면 캔버스 직접 편집 — 블록 툴바·이름/소개 인라인 편집·블록 추가가 켜진다 */
  edit?: CanvasEdit;
}) {
  const theme = themeByKey(page.theme);
  const align =
    page.align === "left" ? "items-start text-left" : page.align === "right" ? "items-end text-right" : "items-center text-center";

  /* 이름·소개 인라인 편집 — 연필을 누르면 그 자리가 입력창이 된다.
     Enter/포커스 이탈로 확정, Escape 로 취소. 확정은 onProfileCommit 이 저장까지 간다. */
  const [inlineField, setInlineField] = useState<null | "title" | "bio">(null);
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
    if (e.key === "Escape") setInlineField(null);
  };

  const editable = mode !== "live" && !!edit;
  /* live 는 공개 렌더러가 숨기는 블록을 **여기서도 뺀다**. draft 는 전부 그린다 —
     캔버스 편집에선 꺼진(active=false) 블록도 흐리게 그려야 다시 켤 수 있다. */
  const visible = mode === "live" ? blocks.filter((b) => !hiddenReason(b.type, b.data)) : blocks;
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
        <img src={page.avatarPath} alt="" className="mb-2.5 size-16 rounded-full object-cover" />
      ) : (
        /* 사진이 없으면 이니셜 원 — 공개 페이지도 같은 것을 그린다. */
        <span
          className="mb-2.5 flex size-16 items-center justify-center rounded-full text-[20px] font-bold"
          style={{ background: theme.card, color: theme.muted }}
          aria-hidden
        >
          {initialOf(page.title || page.slug)}
        </span>
      )
    ) : null;

  return (
    <div className="mx-auto w-full max-w-[380px]">
      {/* 폰 프레임 */}
      <div className="overflow-hidden rounded-[28px] border-4 border-fg/10 bg-plate shadow-pop">
        <div
          style={themeVars(theme) as React.CSSProperties}
          className="max-h-[620px] overflow-y-auto bg-[var(--lp-bg)] px-5 pb-10 pt-8 text-[var(--lp-fg)]"
        >
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
                maxLength={200}
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
              visible.map((b) => <PreviewBlock key={b.id} block={b} mode="live" />)
            ) : editable && edit ? (
              visible.map((b, i) => {
                const label = blockSummary(b.type, b.data);
                return (
                  <div key={b.id} className="relative pt-3">
                    {/* 블록 툴바 — 링크팜의 블록 위 상시 도구(편집·이동·노출·삭제).
                        스크림 배경이라 어떤 테마 위에서도 보인다. */}
                    <div className="absolute right-2 top-0 z-10 flex items-center rounded-chip bg-scrim px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => edit.onEdit(b.id)}
                        aria-label={`${label} 편집`}
                        className="trans-state rounded-full p-1 text-on-scrim/85 hover:text-on-scrim"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => edit.onMove(b.id, "up", label)}
                        disabled={i === 0}
                        aria-label={`${label} 위로`}
                        className="trans-state rounded-full p-1 text-on-scrim/85 hover:text-on-scrim disabled:opacity-30"
                      >
                        <ArrowUp className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => edit.onMove(b.id, "down", label)}
                        disabled={i === visible.length - 1}
                        aria-label={`${label} 아래로`}
                        className="trans-state rounded-full p-1 text-on-scrim/85 hover:text-on-scrim disabled:opacity-30"
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
                    </div>

                    <button
                      type="button"
                      id={`blk-${b.id}`}
                      onClick={() => edit.onEdit(b.id)}
                      aria-label={`${BLOCK_CATALOG.find((c) => c.type === b.type)?.label ?? b.type} · ${label} 편집`}
                      className={cn(
                        "trans-state block w-full rounded-[calc(var(--lp-radius)+4px)] text-left outline-offset-2",
                        selectedId === b.id && "outline outline-2 outline-primary",
                        /* 꺼진 블록은 흐리게 남긴다 — 목록이 없어진 지금, 여기서 안 보이면 다시 켤 길이 없다 */
                        !b.active && "opacity-40",
                      )}
                    >
                      <PreviewBlock block={b} />
                    </button>
                    {!b.active ? (
                      <p className="mt-1 text-center text-[10px] text-[var(--lp-muted)]">숨김 — 공개 페이지에 안 나가요</p>
                    ) : null}
                  </div>
                );
              })
            ) : (
              visible.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onPick?.(b.id)}
                  aria-label={`${BLOCK_CATALOG.find((c) => c.type === b.type)?.label ?? b.type} · ${blockSummary(b.type, b.data)} 편집`}
                  className={cn(
                    "trans-state block w-full rounded-[calc(var(--lp-radius)+4px)] text-left outline-offset-2",
                    selectedId === b.id && "outline outline-2 outline-primary",
                  )}
                >
                  <PreviewBlock block={b} />
                </button>
              ))
            )}

            {editable && edit ? (
              <button
                type="button"
                onClick={edit.onAdd}
                className="trans-state flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[var(--lp-radius)] border border-dashed border-[var(--lp-border)] text-[13px] font-semibold text-[var(--lp-muted)] hover:border-[var(--lp-accent)] hover:text-[var(--lp-accent)]"
              >
                <Plus className="size-4" aria-hidden />
                블록 추가
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[12px] text-fg-sub">
        {mode === "live"
          ? "마지막 「라이브 반영」 시점의 모습이에요."
          : editable
            ? "이름·소개·블록을 이 자리에서 바로 고칠 수 있어요."
            : "블록을 누르면 바로 편집할 수 있어요."}
      </p>
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

function PreviewBlock({ block, mode = "draft" }: { block: LinkBlock; mode?: "draft" | "live" }) {
  const d = block.data ?? {};

  /* 공개 렌더러가 숨기는 조건과 **같은 함수**를 쓴다. live 는 부모가 이미 걸렀지만
     혹시 새 숨김 조건이 부모 필터를 놓쳐도 유령칸이 라이브에 새지 않게 한 번 더 막는다. */
  const hidden = hiddenReason(block.type, d);
  if (hidden) return mode === "live" ? null : <Ghost reason={hidden} />;

  switch (block.type) {
    case "link": {
      const emphasis = s(d, "emphasis") || "normal";
      return (
        <div
          className={[
            "flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--lp-radius-btn)] px-4 py-2.5 text-center text-[13px] font-semibold",
            emphasis === "primary"
              ? "bg-[var(--lp-accent)] text-[var(--lp-on-accent)]"
              : emphasis === "outline"
                ? "border-2 border-[var(--lp-accent)] text-[var(--lp-accent)]"
                : `${card}`,
          ].join(" ")}
        >
          {s(d, "emoji") ? <span aria-hidden>{s(d, "emoji")}</span> : null}
          {s(d, "label") || "링크"}
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
    case "card_row":
      return (
        <div className="space-y-2">
          {arr(d, "items")
            .filter((it) => s(it, "url"))
            .map((it, i) => (
              <div key={i} className={`${card} flex items-center gap-2.5 p-2.5`}>
                {s(it, "imagePath") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
                  <img
                    src={s(it, "imagePath")}
                    alt=""
                    className="size-10 shrink-0 rounded-[calc(var(--lp-radius)/1.6)] object-cover"
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{s(it, "title")}</span>
                  {s(it, "subtitle") ? (
                    <span className="block truncate text-[12px] text-[var(--lp-muted)]">{s(it, "subtitle")}</span>
                  ) : null}
                </span>
              </div>
            ))}
        </div>
      );
    case "grid":
      return (
        <div className={`grid gap-2 ${n(d, "columns", 2) === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {arr(d, "items")
            .filter((it) => s(it, "url"))
            .map((it, i) => (
              <div key={i} className={`${card} overflow-hidden`}>
                {s(it, "imagePath") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
                  <img src={s(it, "imagePath")} alt="" className="aspect-square w-full object-cover" />
                ) : null}
                <span className="block px-2 py-1.5 text-center text-[12px] font-medium">{s(it, "title")}</span>
              </div>
            ))}
        </div>
      );
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
    case "map":
      return (
        <div className={`${card} px-3 py-2.5`}>
          <p className="text-[13px] font-semibold">{s(d, "label") || "찾아오시는 길"}</p>
          <p className="mt-0.5 text-[12px] text-[var(--lp-muted)]">{s(d, "address")}</p>
        </div>
      );
    default:
      return null;
  }
}
