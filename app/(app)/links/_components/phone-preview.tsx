"use client";

import { cn } from "@/lib/cn";
import { youtubeEmbed } from "@/lib/links";
import { themeByKey, themeVars, SNS_KINDS } from "@/lib/links/themes";
import { hiddenReason, type LinkBlock } from "@/lib/links/blocks";
import type { LinkPageView } from "./links-client";

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

export function PhonePreview({
  page,
  blocks,
  selectedId,
  onPick,
}: {
  page: LinkPageView;
  blocks: LinkBlock[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const theme = themeByKey(page.theme);
  const align =
    page.align === "left" ? "items-start text-left" : page.align === "right" ? "items-end text-right" : "items-center text-center";

  return (
    <div className="mx-auto w-full max-w-[380px]">
      {/* 폰 프레임 */}
      <div className="overflow-hidden rounded-[28px] border-4 border-fg/10 bg-plate shadow-pop">
        <div
          style={themeVars(theme) as React.CSSProperties}
          className="max-h-[620px] overflow-y-auto bg-[var(--lp-bg)] px-5 pb-10 pt-8 text-[var(--lp-fg)]"
        >
          {/* 커버 */}
          {(page.layout === "cover" || page.layout === "cover_profile") && page.coverPath ? (
            // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
            <img src={page.coverPath} alt="" className="mb-3 aspect-[3/1] w-full rounded-[var(--lp-radius)] object-cover" />
          ) : null}

          {/* 프로필 */}
          <div className={`flex flex-col ${align}`}>
            {page.layout !== "cover" ? (
              page.avatarPath ? (
                // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
                <img src={page.avatarPath} alt="" className="mb-2.5 size-16 rounded-full object-cover" />
              ) : (
                /* 사진이 없으면 이니셜 원 — 공개 페이지도 같은 것을 그린다.
                   아무것도 안 그리면 브랜드 페이지 머리가 통째로 비어 허전하다. */
                <span
                  className="mb-2.5 flex size-16 items-center justify-center rounded-full text-[20px] font-bold"
                  style={{ background: theme.card, color: theme.muted }}
                  aria-hidden
                >
                  {(page.title || page.slug || "?").charAt(0).toUpperCase()}
                </span>
              )
            ) : null}
            <p className="text-[19px] font-bold leading-[1.3]">{page.title || page.slug}</p>
            {page.bio ? (
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[1.6] text-[var(--lp-muted)]">{page.bio}</p>
            ) : null}
            {page.snsLinks.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {page.snsLinks.map((x, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] px-2.5 py-1 text-[11px] font-medium"
                  >
                    {/* 공개 페이지는 한글 라벨을 쓴다 — 여기서 영문 키를 그대로 찍으면
                        미리보기와 실제가 대놓고 다르다 */}
                    {SNS_LABEL.get(x.kind) ?? x.kind}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* 블록 */}
          <div className="mt-6 space-y-2.5">
            {blocks.length === 0 ? (
              <p className="text-center text-[13px] text-[var(--lp-muted)]">블록을 추가하면 여기에 보여요.</p>
            ) : (
              blocks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onPick(b.id)}
                  aria-label={`${b.type} 블록 편집`}
                  className={cn(
                    "trans-state block w-full rounded-[calc(var(--lp-radius)+4px)] text-left outline-offset-2",
                    selectedId === b.id && "outline outline-2 outline-primary",
                  )}
                >
                  <PreviewBlock block={b} />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[12px] text-fg-sub">블록을 누르면 바로 편집할 수 있어요.</p>
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

function PreviewBlock({ block }: { block: LinkBlock }) {
  const d = block.data ?? {};

  /* 공개 렌더러가 숨기는 조건과 **같은 함수**를 쓴다 */
  const hidden = hiddenReason(block.type, d);
  if (hidden) return <Ghost reason={hidden} />;

  switch (block.type) {
    case "link": {
      const emphasis = s(d, "emphasis") || "normal";
      return (
        <div
          className={[
            "flex min-h-[44px] items-center justify-center gap-1.5 rounded-[var(--lp-radius)] px-4 py-2.5 text-center text-[13px] font-semibold",
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
            <p className="text-[13px] font-semibold">{s(d, "title") || "카드 제목"}</p>
            {s(d, "subtitle") ? <p className="mt-0.5 text-[12px] text-[var(--lp-muted)]">{s(d, "subtitle")}</p> : null}
            {s(d, "price") ? <p className="tnum mt-1.5 text-[15px] font-bold">{s(d, "price")}</p> : null}
            {s(d, "ctaLabel") && s(d, "url") ? (
              <span className="mt-2 flex min-h-[32px] items-center justify-center rounded-[var(--lp-radius)] bg-[var(--lp-accent)] px-3 text-[12px] font-semibold text-[var(--lp-on-accent)]">
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
                  <span className="block truncate text-[13px] font-semibold">{s(it, "title") || "제목"}</span>
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
                <span className="block px-2 py-1.5 text-center text-[12px] font-medium">{s(it, "title") || "제목"}</span>
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
          <span className="block h-9 rounded-[var(--lp-radius)] bg-[var(--lp-accent)]" aria-hidden />
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
