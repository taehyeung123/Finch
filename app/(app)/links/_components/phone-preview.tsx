"use client";

import { themeByKey, themeVars } from "@/lib/links/themes";
import type { LinkBlock } from "@/lib/links/blocks";
import type { LinkPageView } from "./links-client";

/*
  라이브 미리보기 — 링크팜의 우측 폰 프레임에 해당.

  ⚠️ 공개 페이지(app/p/[slug])의 BlockRenderer 를 **재사용하지 않는다.** 그쪽은 서버
  컴포넌트이고 링크가 /p/{slug}/go/... 로 나가서, 미리보기에서 누르면 집계가 오염되고
  편집 화면을 떠난다. 여기서는 **누를 수 없는 시각 복제**만 만든다.

  대신 색·모서리·그림자는 같은 테마 토큰(--lp-*)에서 온다 — 그래야 미리보기와 실제가
  어긋나지 않는다. 구조가 바뀌면 두 곳을 같이 고쳐야 한다는 게 이 방식의 대가다.
*/

const s = (d: Record<string, unknown>, k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
const n = (d: Record<string, unknown>, k: string, fb: number) => (typeof d[k] === "number" ? (d[k] as number) : fb);
const arr = (d: Record<string, unknown>, k: string) =>
  Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : [];

const card = "rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] shadow-[var(--lp-shadow)]";

export function PhonePreview({ page, blocks }: { page: LinkPageView; blocks: LinkBlock[] }) {
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
                <span
                  className="mb-2.5 flex size-16 items-center justify-center rounded-full text-[20px] font-bold"
                  style={{ background: theme.card, color: theme.muted }}
                  aria-hidden
                >
                  {(page.title || "?").charAt(0)}
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
                    {x.kind}
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
              blocks.map((b) => <PreviewBlock key={b.id} block={b} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBlock({ block }: { block: LinkBlock }) {
  const d = block.data ?? {};

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
      return s(d, "imagePath") ? (
        // eslint-disable-next-line @next/next/no-img-element -- 미리보기용 원격 URL
        <img src={s(d, "imagePath")} alt="" className="w-full rounded-[var(--lp-radius)] object-cover" />
      ) : (
        <div className={`${card} flex h-24 items-center justify-center text-[12px] text-[var(--lp-muted)]`}>
          이미지 주소를 넣어주세요
        </div>
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
          </div>
        </div>
      );
    case "video":
      return (
        <div className={`${card} flex aspect-video items-center justify-center text-[12px] text-[var(--lp-muted)]`}>
          ▶ {s(d, "title") || "동영상"}
        </div>
      );
    case "card_row":
      return (
        <div className="space-y-2">
          {arr(d, "items").map((it, i) => (
            <div key={i} className={`${card} flex items-center gap-2.5 p-2.5`}>
              <span className="size-10 shrink-0 rounded-[calc(var(--lp-radius)/1.6)] bg-[var(--lp-border)]" aria-hidden />
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
          {arr(d, "items").map((it, i) => (
            <div key={i} className={`${card} overflow-hidden`}>
              <span className="block aspect-square w-full bg-[var(--lp-border)]" aria-hidden />
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
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: n(d, "count", 6) }).map((_, i) => (
            <span
              key={i}
              className="block aspect-square rounded-[calc(var(--lp-radius)/1.6)] bg-[var(--lp-border)]"
              aria-hidden
            />
          ))}
        </div>
      );
    case "contact":
    case "subscribe":
      return (
        <div className={`${card} space-y-2 p-3`}>
          <p className="text-[13px] font-semibold">
            {s(d, "title") || (block.type === "subscribe" ? "새 소식 받기" : "문의하기")}
          </p>
          <span className="block h-9 rounded-[calc(var(--lp-radius)/1.6)] border border-[var(--lp-border)]" aria-hidden />
          <span
            className="block h-9 rounded-[var(--lp-radius)] bg-[var(--lp-accent)]"
            aria-hidden
          />
        </div>
      );
    case "map":
      return (
        <div className={`${card} px-3 py-2.5`}>
          <p className="text-[13px] font-semibold">{s(d, "label") || "찾아오시는 길"}</p>
          <p className="mt-0.5 text-[12px] text-[var(--lp-muted)]">{s(d, "address") || "주소를 입력하세요"}</p>
        </div>
      );
    default:
      return null;
  }
}
