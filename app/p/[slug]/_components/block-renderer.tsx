import { youtubeEmbed } from "@/lib/links";
import type { BlockType } from "@/lib/links/blocks";
import { COUPANG_DISCLOSURE, musicEmbed } from "@/lib/links/blocks";
import { Collapsible } from "./collapsible";
import { GuestbookForm } from "./guestbook-form";
import { SearchBlock } from "./search-block";
import { Download, UserPlus } from "lucide-react";
import { lpText, lpN, type LpText } from "@/lib/links/i18n";

/** 방명록 글(공개분) — 페이지가 읽어서 렌더러에 넘긴다 */
export interface GuestbookPublicEntry {
  id: number;
  name: string;
  message: string;
  reply: string | null;
  createdAt: string;
}

/*
  공개 페이지 블록 렌더러.

  ⚠️ 여기서 쓰는 색은 전부 **테마 CSS 변수(--lp-*)** 다. 앱 디자인 토큰(bg-body 등)을
  쓰면 안 된다 — 이 화면은 방문자의 브랜드 화면이지 핀치 화면이 아니고, 앱 토큰은
  방문자의 다크모드 설정에 반응해 사용자가 고른 테마를 덮어쓴다.

  링크는 전부 /p/{slug}/go/{blockId} 를 거친다(클릭 집계). 실제 목적지를 href 에
  노출하지 않아 집계 우회도 막힌다.
*/

export interface SnapshotBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

const s = (d: Record<string, unknown>, k: string): string =>
  typeof d[k] === "string" ? (d[k] as string) : "";
const n = (d: Record<string, unknown>, k: string, fb: number): number =>
  typeof d[k] === "number" ? (d[k] as number) : fb;
const arr = (d: Record<string, unknown>, k: string): Record<string, unknown>[] =>
  Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : [];

/** 클릭 집계 경로. url 이 없는 블록은 링크로 만들지 않는다 */
function goHref(slug: string, blockId: string, idx?: number): string {
  return idx === undefined ? `/p/${slug}/go/${blockId}` : `/p/${slug}/go/${blockId}?i=${idx}`;
}

/*
  카드 리듬(2026-08-24 비평 반영) — 블록마다 여백·간격·가격 크기가 제각각이라
  같은 성격의 카드가 서로 다른 밀도로 나왔다. 세 가지만 쓴다.
   · 카드 안쪽 여백: 사진이 꽉 찬 카드는 px-4 py-3.5, 손바닥만 한 셀은 px-3 py-2.5
   · 사진 격자 간격: gap-2(8px) 하나 — 갤러리·그리드·최근 게시물이 같은 밀도
   · 가격: 카드 본문 17px / 목록·셀 13px (부제 14px 보다 작아지지 않는다)
*/
const cardCls =
  "block rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] shadow-[var(--lp-shadow)]";

/** 강조 태그 칩 — 링크·항목 아래. 비어 있으면 null */
function Tags({ d, align = "center", inherit = false }: { d: Record<string, unknown>; align?: "center" | "start"; inherit?: boolean }) {
  const tags = Array.isArray(d.tags) ? (d.tags as unknown[]).filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 3) : [];
  if (!tags.length) return null;
  return (
    <span className={`mt-1.5 flex flex-wrap gap-1 ${align === "start" ? "justify-start" : "justify-center"}`}>
      {tags.map((t) => (
        <span
          key={t}
          /* 버튼(채움/외곽선) 위에서는 글자색을 **상속**한다 — accent 배경 위 accent 글자는 안 보인다(소넷 확정) */
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${inherit ? "" : "text-[var(--lp-accent-text)]"}`}
          style={{ backgroundColor: inherit ? "color-mix(in srgb, currentColor 16%, transparent)" : "color-mix(in srgb, var(--lp-accent) 14%, transparent)" }}
        >
          #{t}
        </span>
      ))}
    </span>
  );
}

/** 판매가·정가 — 표시용 문자열 그대로. 정가는 취소선 */
function Price({ d, size = "md", inherit = false, align = "start" }: { d: Record<string, unknown>; size?: "sm" | "md"; inherit?: boolean; align?: "center" | "start" }) {
  const price = s(d, "price");
  if (!price) return null;
  const orig = s(d, "originalPrice");
  return (
    /* 정렬은 Tags 와 같은 규칙 — 가운데 정렬 카드에서 가격만 왼쪽에 붙던 것(2026-08-24 비평) */
    <span className={`tnum mt-1 flex items-baseline gap-1.5 ${align === "center" ? "justify-center" : ""} ${size === "sm" ? "text-[13px]" : "text-[15px]"}`}>
      <span className={`font-bold ${inherit ? "" : "text-[var(--lp-fg)]"}`}>{price}</span>
      {orig ? <span className={`text-[12px] line-through ${inherit ? "opacity-70" : "text-[var(--lp-muted)]"}`}>{orig}</span> : null}
    </span>
  );
}

const EXT_BLANK = { target: "_blank", rel: "noopener noreferrer nofollow" };

export function BlockRenderer({
  block,
  slug,
  guestbook,
  isDemo = false,
  t = lpText("ko"),
  ext = EXT_BLANK,
}: {
  block: SnapshotBlock;
  slug: string;
  /** 방명록 블록일 때 — 공개 글 목록 */
  guestbook?: GuestbookPublicEntry[];
  isDemo?: boolean;
  /** 페이지 언어 문구(0058) */
  t?: LpText;
  /** 외부 링크 속성 — 새 창/현재 창(0058). SNS 줄·고정 CTA 와 같은 값을 받는다 */
  ext?: { target?: string; rel: string };
}) {
  const d = block.data ?? {};
  const type = block.type as BlockType;

  switch (type) {
    /* ── 리틀리 흡수 4단계 블록 ─────────────────────────────── */
    case "gallery": {
      const items = arr(d, "items").map((it, i) => ({ it, i })).filter(({ it }) => s(it, "imagePath"));
      if (items.length === 0) return null;
      const layout = s(d, "layout") || "grid";
      const square = (s(d, "aspect") || "square") === "square";
      const imgCls = `w-full object-cover ${square ? "aspect-square" : ""}`;
      const cell = ({ it, i }: { it: Record<string, unknown>; i: number }) => {
        const img = (
          // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
          <img src={s(it, "imagePath")} alt={s(it, "alt")} className={`${imgCls} rounded-[calc(var(--lp-radius)/1.6)]`} loading="lazy" />
        );
        return s(it, "url") ? (
          <a key={i} href={goHref(slug, block.id, i)} {...ext} className="lp-btn block overflow-hidden rounded-[calc(var(--lp-radius)/1.6)]" aria-label={s(it, "alt") || lpN(t.photoLink, i + 1)}>
            {img}
          </a>
        ) : (
          <div key={i}>{img}</div>
        );
      };
      if (layout === "carousel" || layout === "slide") {
        return (
          <div className={`-mx-5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
            {items.map(({ it, i }) => (
              <div key={i} className={`${layout === "slide" ? "w-full" : "w-[78%]"} shrink-0 snap-center`}>
                {cell({ it, i })}
              </div>
            ))}
          </div>
        );
      }
      if (layout === "list") return <div className="space-y-2.5">{items.map(cell)}</div>;
      if (layout === "masonry") return <div className="columns-2 gap-2 [&>*]:mb-2 [&>*]:break-inside-avoid">{items.map(cell)}</div>;
      return <div className="grid grid-cols-3 gap-2">{items.map(cell)}</div>;
    }

    case "music": {
      const em = musicEmbed(s(d, "url"));
      if (!em) return null;
      return (
        <div className={`${cardCls} overflow-hidden`}>
          {s(d, "title") ? <p className="px-3 pt-2.5 text-[14px] font-semibold text-[var(--lp-fg)]">{s(d, "title")}</p> : null}
          <iframe
            src={em.src}
            title={s(d, "title") || t.music}
            height={em.height}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
            className="block w-full border-0"
          />
        </div>
      );
    }

    case "vcard": {
      if (!s(d, "name").trim()) return null;
      return (
        <a
          href={`/p/${slug}/vcard/${block.id}`}
          className="lp-btn flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[var(--lp-radius-btn)] border border-[var(--lp-btn-border)] bg-[var(--lp-btn-bg)] px-5 py-3 text-[15px] font-semibold text-[var(--lp-btn-fg)] shadow-[var(--lp-shadow)]"
        >
          <UserPlus className="size-4" aria-hidden />
          {s(d, "label") || t.vcard}
          {/* 이름은 버튼 글자색을 **그대로** 상속한다 — muted 는 「강조색 전체 적용」에서 안 읽혔고,
              불투명도(75%)로 위계를 주면 프리셋 19종 중 12종이 4.5:1 미달이었다(소넷 확정).
              위계는 크기·굵기로만: 15px semibold vs 12px normal. */}
          <span className="text-[12px] font-normal">· {s(d, "name")}</span>
        </a>
      );
    }

    case "search":
      return <SearchBlock placeholder={s(d, "placeholder") || t.search.placeholder} t={t.search} />;

    case "file": {
      if (!s(d, "url")) return null;
      const size = n(d, "fileSize", 0);
      const sizeLabel = size > 0 ? (size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(size / 1024))}KB`) : "";
      return (
        <a href={goHref(slug, block.id)} {...ext} className={`lp-btn ${cardCls} flex items-center gap-3 p-3`}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[calc(var(--lp-radius)/1.6)] bg-[var(--lp-accent)] text-[var(--lp-on-accent)]" aria-hidden>
            <Download className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-[var(--lp-fg)]">{s(d, "title") || s(d, "fileName") || t.file}</span>
            <span className="block truncate text-[13px] text-[var(--lp-muted)]">
              {[s(d, "description"), s(d, "fileName"), sizeLabel].filter(Boolean).join(" · ")}
            </span>
          </span>
        </a>
      );
    }

    case "guestbook": {
      const entries = guestbook ?? [];
      return (
        <div className={`${cardCls} p-4`}>
          <p className="text-[15px] font-semibold text-[var(--lp-fg)]">{s(d, "title") || t.guestbook.title}</p>
          <div className="mt-3">
            <GuestbookForm slug={slug} blockId={block.id} placeholder={s(d, "placeholder") || t.guestbook.placeholder} isDemo={isDemo} t={t.guestbook} errors={t.errors} />
          </div>
          {entries.length ? (
            /* 글이 20개면 그 아래 블록이 통째로 묻힌다 — 3개만 펼쳐 두고 나머지는 「더 보기」로(2026-08-24 비평).
               Collapsible 은 다른 목록 블록과 같은 컴포넌트라 동작·문구가 한 곳이다. */
            <Collapsible
              as="ul"
              moreLabel={t.more}
              lessLabel={t.less}
              initial={3}
              className="mt-4 space-y-3 border-t border-[var(--lp-border)] pt-3"
              items={entries.map((g) => (
                <li key={g.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold text-[var(--lp-fg)]">{g.name}</span>
                    <span className="tnum text-[11px] text-[var(--lp-muted)]">{g.createdAt.slice(0, 10)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[14px] text-[var(--lp-fg)]">{g.message}</p>
                  {g.reply ? (
                    <p className="mt-1.5 rounded-[calc(var(--lp-radius)/1.6)] px-2.5 py-1.5 text-[13px] text-[var(--lp-muted)]" style={{ backgroundColor: "color-mix(in srgb, var(--lp-accent) 10%, transparent)" }}>
                      ↳ {g.reply}
                    </p>
                  ) : null}
                </li>
              ))}
            />
          ) : (
            <p className="mt-3 text-center text-[13px] text-[var(--lp-muted)]">{t.guestbook.empty}</p>
          )}
        </div>
      );
    }

    /* ── 링크 버튼 ─────────────────────────────────────────── */
    case "link": {
      /* 주소가 비면 **아예 그리지 않는다.** <a> 로 그리면 /p/{slug}/go/{id} 가
         목적지를 못 찾고 같은 페이지로 되던져서, 방문자에게는 "눌렀는데 새로고침만
         된" 것으로 보인다. 새 페이지에 기본으로 깔리는 빈 「새 링크」가 그대로
         발행되는 게 가장 흔한 경로다. */
      if (!s(d, "url")) return null;
      const label = s(d, "label") || t.link;
      const emoji = s(d, "emoji");
      const emphasis = s(d, "emphasis") || "normal";
      const primary = emphasis === "primary";
      const outline = emphasis === "outline";
      /* 블록별 텍스트 스타일 — 값이 있을 때만 inline 으로 얹는다(없으면 테마가 정한다).
         색은 sanitize 가 #rrggbb 만 통과시키지만 여기서도 한 번 더 거른다. */
      const textStyle: React.CSSProperties = {};
      const tSize = s(d, "textSize");
      if (tSize === "sm") textStyle.fontSize = "13px";
      else if (tSize === "lg") textStyle.fontSize = "17px";
      const tWeight = s(d, "textWeight");
      if (tWeight === "medium") textStyle.fontWeight = 500;
      else if (tWeight === "bold") textStyle.fontWeight = 700;
      if (/^#[0-9a-fA-F]{6}$/.test(s(d, "textColor"))) textStyle.color = s(d, "textColor");
      const layout = s(d, "layout") || "button";
      const thumb = s(d, "imagePath");
      /* 카드 레이아웃(리틀리 작은/중간/큰 카드) — 썸네일·태그·가격이 함께 보인다 */
      if (layout === "small" || layout === "medium" || layout === "large") {
        const big = layout === "large";
        const thumbCls = layout === "small" ? "size-14" : "size-[88px]";
        return (
          <a
            href={goHref(slug, block.id)}
            {...ext}
            className={`lp-btn ${cardCls} overflow-hidden ${big ? "" : "flex items-center gap-3 p-3"}`}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
              <img
                src={thumb}
                alt=""
                className={big ? "aspect-[16/9] w-full object-cover" : `${thumbCls} shrink-0 rounded-[calc(var(--lp-radius)/1.6)] object-cover`}
                loading="lazy"
              />
            ) : null}
            <span className={`min-w-0 flex-1 ${big ? "block px-4 py-3 text-center" : ""}`}>
              <span style={textStyle} className="block text-[15px] font-semibold text-[var(--lp-fg)]">
                {emoji ? <span aria-hidden>{emoji} </span> : null}
                {label}
              </span>
              <Price d={d} size={big ? "md" : "sm"} align={big ? "center" : "start"} />
              <Tags d={d} align={big ? "center" : "start"} />
            </span>
          </a>
        );
      }
      const hasExtras = s(d, "price") || (Array.isArray(d.tags) && (d.tags as unknown[]).length > 0);
      return (
        <a
          href={goHref(slug, block.id)}
          {...ext}
          style={textStyle}
          className={[
            "lp-btn flex min-h-[56px] w-full items-center justify-center rounded-[var(--lp-radius-btn)] px-5 py-3 text-center text-[15px] font-semibold",
            /* gap 은 **하나만** 건다 — gap-2 와 gap-0.5 를 겹쳐 쓰면 어느 쪽이 이길지가
               Tailwind 방출 순서에 달린다(2026-08-24 비평) */
            hasExtras ? "flex-col gap-0.5" : "gap-2",
            primary
              /* 강조 버튼에만 그림자가 없어 일반 버튼보다 낮게 깔렸다(위계 역전, 2026-08-24 비평) */
              ? "bg-[var(--lp-accent)] text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)]"
              : outline
                ? "border-2 border-[var(--lp-accent)] bg-transparent text-[var(--lp-accent-text)]"
                : "border border-[var(--lp-btn-border)] bg-[var(--lp-btn-bg)] text-[var(--lp-btn-fg)] shadow-[var(--lp-shadow)]",
          ].join(" ")}
        >
          <span className="flex items-center gap-2">
            {emoji ? <span aria-hidden>{emoji}</span> : null}
            {label}
          </span>
          {hasExtras ? (
            <span className="flex flex-col items-center">
              <Price d={d} size="sm" inherit />
              <Tags d={d} inherit />
            </span>
          ) : null}
        </a>
      );
    }

    /* ── 레이아웃 ──────────────────────────────────────────── */
    case "heading":
      /* 링크 라벨(15px semibold)과 1px 차이라 구획이 안 읽혔다 — 크기·자간·여백으로 확실히 가른다 */
      return <h2 className="pt-5 pb-0.5 text-[17px] font-bold tracking-[-0.02em] text-[var(--lp-fg)]">{s(d, "text")}</h2>;

    case "text":
      return (
        <p
          className="whitespace-pre-wrap text-[15px] leading-[1.7] text-[var(--lp-muted)]"
          style={{ textAlign: s(d, "align") === "center" ? "center" : "left" }}
        >
          {s(d, "text")}
        </p>
      );

    case "divider":
      return s(d, "style") === "dot" ? (
        <p className="text-center text-[var(--lp-muted)]" aria-hidden>
          · · ·
        </p>
      ) : (
        <hr className="border-0 border-t border-[var(--lp-border)]" />
      );

    case "spacer":
      return <div style={{ height: n(d, "size", 24) }} aria-hidden />;

    /* ── 콘텐츠 ────────────────────────────────────────────── */
    case "image": {
      const src = s(d, "imagePath");
      if (!src) return null;
      const url = s(d, "url");
      /* 업로드 때 잰 치수로 로드 전 자리를 잡는다(CLS). 서버 액션을 직접 불러 이상한 값을
         넣어도 화면이 깨지지 않게 비율 0.1~10 밖은 무시한다 */
      const iw = n(d, "imgW", 0);
      const ih = n(d, "imgH", 0);
      const ratio = iw > 0 && ih > 0 && iw / ih >= 0.1 && iw / ih <= 10 ? `${iw} / ${ih}` : undefined;
      const img = (
        // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL. 방문자 페이지라 최적화 프록시를 안 태운다
        <img
          src={src}
          alt={s(d, "alt")}
          style={ratio ? { aspectRatio: ratio } : undefined}
          className="w-full rounded-[var(--lp-radius)] border border-[var(--lp-border)] object-cover"
          loading="lazy"
        />
      );
      return url ? (
        /* 대체 텍스트가 비면 링크 이름이 비어 스크린리더가 경로만 읽는다 — 최소한의 이름을 준다(감사 #21) */
        <a
          href={goHref(slug, block.id)}
          {...ext}
          className="block"
          aria-label={s(d, "alt") ? undefined : t.imageLink}
        >
          {img}
        </a>
      ) : (
        img
      );
    }

    case "image_card": {
      const src = s(d, "imagePath");
      const title = s(d, "title");
      const sub = s(d, "subtitle");
      const url = s(d, "url");
      const price = s(d, "price");
      const cta = s(d, "ctaLabel");
      const inner = (
        <div className={`${cardCls} overflow-hidden`}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
            <img src={src} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
          ) : null}
          <div className="px-4 py-3.5">
            <p className="text-[15px] font-semibold text-[var(--lp-fg)]">{title}</p>
            {sub ? <p className="mt-1 text-[14px] text-[var(--lp-muted)]">{sub}</p> : null}
            {price ? <p className="tnum mt-2 text-[17px] font-bold text-[var(--lp-fg)]">{price}</p> : null}
            {/* 카드 전체가 이미 링크다 — 버튼은 <span> 이어야 한다(<a> 중첩은 무효 HTML).
                url 이 없으면 누를 수 없으므로 버튼도 안 그린다. */}
            {cta && url ? (
              <span className="lp-btn mt-3 flex min-h-[48px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-4 text-[15px] font-semibold text-[var(--lp-on-accent)]">
                {cta}
              </span>
            ) : null}
          </div>
        </div>
      );
      return url ? (
        /* 카드 전체가 링크다 — lp-btn 을 붙여 다른 누를 수 있는 면과 같은 호버·눌림을 준다(2026-08-24 비평) */
        <a href={goHref(slug, block.id)} {...ext} aria-label={s(d, "title") || s(d, "subtitle") || s(d, "ctaLabel") ? undefined : t.imageLink} className="lp-btn block">
          {inner}
        </a>
      ) : (
        inner
      );
    }

    case "video": {
      const url = s(d, "url");
      if (!url) return null;
      const embed = youtubeEmbed(url);
      /* 임베드를 못 만들면 **링크 버튼으로 대체한다** — 깨진 iframe 을 보여주는 것보다
         "영상 보러 가기"가 낫다(틱톡·인스타는 임베드 정책이 자주 바뀐다). */
      if (!embed) {
        return (
          <a
            href={goHref(slug, block.id)}
            {...ext}
            className={`lp-btn ${cardCls} flex min-h-[56px] items-center justify-center px-5 py-3 text-[15px] font-semibold text-[var(--lp-fg)]`}
          >
            ▶ {s(d, "title") || t.video}
          </a>
        );
      }
      return (
        <div className={`${cardCls} overflow-hidden`}>
          <iframe
            src={embed}
            title={s(d, "title") || t.video}
            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="aspect-video w-full border-0"
          />
        </div>
      );
    }

    case "card_row": {
      /* 주소 없는 항목은 뺀다 — 그 자리를 <a> 로 그리면 방문자를 같은 페이지로 되던진다.
         ⚠️ 인덱스는 **원본 배열 기준**을 유지한다. 걸러낸 뒤 다시 매기면
         /go/{id}?i=N 이 스냅샷의 엉뚱한 항목을 가리킨다. */
      const items = arr(d, "items").map((it, i) => ({ it, i })).filter(({ it }) => s(it, "url"));
      if (items.length === 0) return null;
      /* 캐러셀 — 가로 스크롤·스냅. 접기는 목록 배치에서만(캐러셀은 이미 한 화면에 몇 장만 보인다) */
      if (s(d, "layout") === "carousel") {
        return (
          <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map(({ it, i }) => (
              <a
                key={i}
                href={goHref(slug, block.id, i)}
                {...ext}
                aria-label={s(it, "title") ? undefined : lpN(t.itemLink, i + 1)}
                className={`lp-btn ${cardCls} w-[72%] shrink-0 snap-start overflow-hidden`}
              >
                {s(it, "imagePath") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
                  <img src={s(it, "imagePath")} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                ) : null}
                <span className="block px-3 py-2.5">
                  <span className="block truncate text-[15px] font-semibold text-[var(--lp-fg)]">{s(it, "title")}</span>
                  {s(it, "subtitle") ? <span className="mt-0.5 block truncate text-[13px] text-[var(--lp-muted)]">{s(it, "subtitle")}</span> : null}
                  <Price d={it} size="sm" />
                </span>
              </a>
            ))}
          </div>
        );
      }
      const nodes = items.map(({ it, i }) => (
        <a key={i} href={goHref(slug, block.id, i)} {...ext} aria-label={s(it, "title") ? undefined : lpN(t.itemLink, i + 1)} className={`lp-btn ${cardCls} flex items-center gap-3 p-3`}>
          {s(it, "imagePath") ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
            <img src={s(it, "imagePath")} alt="" className="size-14 shrink-0 rounded-[calc(var(--lp-radius)/1.6)] object-cover" loading="lazy" />
          ) : null}
          <span className="min-w-0 flex-1">
            {/* 390px 에서 한글 15자를 넘기면 잘렸다 — 두 줄까지 보여준다(그리드 셀은 원래 안 자른다) */}
            <span className="line-clamp-2 block text-[15px] font-semibold text-[var(--lp-fg)]">{s(it, "title")}</span>
            {s(it, "subtitle") ? <span className="mt-0.5 block truncate text-[14px] text-[var(--lp-muted)]">{s(it, "subtitle")}</span> : null}
            <Price d={it} size="sm" />
          </span>
        </a>
      ));
      return <Collapsible moreLabel={t.more} lessLabel={t.less} items={nodes} initial={n(d, "collapse", 0)} className="space-y-2.5" />;
    }

    case "grid": {
      /* card_row 와 같은 이유·같은 규칙 — 원본 인덱스를 유지한 채 주소 없는 항목만 뺀다 */
      const items = arr(d, "items").map((it, i) => ({ it, i })).filter(({ it }) => s(it, "url"));
      if (items.length === 0) return null;
      const cols = n(d, "columns", 2) === 3 ? "grid-cols-3" : "grid-cols-2";
      const nodes = items.map(({ it, i }) => (
        <a key={i} href={goHref(slug, block.id, i)} {...ext} aria-label={s(it, "title") ? undefined : lpN(t.itemLink, i + 1)} className={`lp-btn ${cardCls} overflow-hidden`}>
          {s(it, "imagePath") ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
            <img src={s(it, "imagePath")} alt="" className="aspect-square w-full object-cover" loading="lazy" />
          ) : null}
          {/* 사진 없는 셀은 라벨만이라 40px 이었다 — 그때만 터치 최소치(44px)를 바닥으로 준다.
              사진 있는 셀까지 밀면 짧은 제목 아래 빈 칸이 생겨 격자 리듬이 헐거워진다(소넷 확정) */}
          <span
            className={`flex flex-col items-center justify-center px-3 py-2.5 text-center text-[14px] font-medium text-[var(--lp-fg)] ${s(it, "imagePath") ? "" : "min-h-11"}`}
          >
            {/* 3열에서 제목이 2~3줄로 흘러 격자 밑변이 들쭉날쭉했다 — 두 줄까지만 */}
            <span className="line-clamp-2">{s(it, "title")}</span>
            <Price d={it} size="sm" align="center" />
          </span>
        </a>
      ));
      return <Collapsible moreLabel={t.more} lessLabel={t.less} items={nodes} initial={n(d, "collapse", 0)} className={`grid gap-2 ${cols}`} />;
    }

    case "notice": {
      const tone = s(d, "tone") || "info";
      return (
        <div
          className={[
            "rounded-[var(--lp-radius)] px-4 py-3.5 text-[14px] leading-[1.6] shadow-[var(--lp-shadow)]",
            tone === "primary"
              ? "bg-[var(--lp-accent)] text-[var(--lp-on-accent)]"
              /* 일반 카드와 구분이 안 됐다 — 왼쪽에 강조색 띠를 세워 "안내"로 읽히게(2026-08-24 비평) */
              : "border border-l-[3px] border-[var(--lp-border)] border-l-[var(--lp-accent)] bg-[var(--lp-card)] text-[var(--lp-fg)]",
          ].join(" ")}
        >
          {s(d, "text")}
        </div>
      );
    }

    /* ── 핀치 고유: 연동 채널의 최근 게시물 ────────────────── */
    case "social_feed": {
      const cached = arr(d, "cached");
      if (cached.length === 0) return null;
      return (
        <div className="grid grid-cols-3 gap-2">
          {cached.slice(0, 9).map((it, i) => {
            const thumb = s(it, "thumbUrl");
            const inner = thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- 플랫폼 CDN URL
              <img src={thumb} alt="" className="aspect-square w-full object-cover" loading="lazy" />
            ) : (
              <span className="block aspect-square w-full bg-[var(--lp-border)]" />
            );
            return s(it, "permalink") ? (
              <a
                key={i}
                href={goHref(slug, block.id, i)}
                {...ext}
                aria-label={lpN(t.postLink, i + 1)}
                className="overflow-hidden rounded-[calc(var(--lp-radius)/1.6)]"
              >
                {inner}
              </a>
            ) : (
              <span key={i} className="overflow-hidden rounded-[calc(var(--lp-radius)/1.6)]">
                {inner}
              </span>
            );
          })}
        </div>
      );
    }

    /* ── 받기 — 폼은 클라이언트 컴포넌트가 따로 담당한다 ──── */
    case "contact":
    case "subscribe":
      /* 여기서는 렌더하지 않는다. 폼은 상태·제출이 필요해 클라이언트 컴포넌트
         (lead-form.tsx)가 맡고, page.tsx 가 타입을 보고 그쪽으로 보낸다.
         서버 렌더러에 폼 로직을 섞으면 이 파일이 클라이언트 번들로 끌려간다. */
      return null;

    /* ── 쿠팡 파트너스 상품 — 고지 문구는 항상 붙는다(공정위 표시 의무).
       클릭은 /go 집계를 거친다. url 없으면 링크 버튼과 같은 이유로 안 그린다. ── */
    case "coupang": {
      if (!s(d, "url")) return null;
      return (
        <div className="overflow-hidden rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] shadow-[var(--lp-shadow)]">
          {s(d, "imagePath") ? (
            // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드·원격 URL
            <img src={s(d, "imagePath")} alt={s(d, "title")} className="aspect-[16/9] w-full object-cover" />
          ) : null}
          <div className="px-4 py-3">
            {/* 배지와 CTA 가 둘 다 강조색이면 24px 안에서 시선이 두 번 터진다 — 배지는 틴트로 낮춘다(2026-08-24 비평) */}
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold"
              style={{ backgroundColor: "color-mix(in srgb, var(--lp-accent) 14%, transparent)", color: "var(--lp-accent-text)" }}
            >
              쿠팡 파트너스
            </span>
            <p className="mt-1.5 text-[15px] font-semibold text-[var(--lp-fg)]">{s(d, "title") || t.product}</p>
            {s(d, "price") ? <p className="tnum mt-0.5 text-[17px] font-bold text-[var(--lp-fg)]">{s(d, "price")}</p> : null}
            <a
              href={goHref(slug, block.id)}
              {...ext}
              className="lp-btn mt-2.5 flex min-h-[48px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-4 text-[15px] font-semibold text-[var(--lp-on-accent)]"
            >
              {t.coupangView}
            </a>
            <p className="mt-2 text-[11px] leading-[1.6] text-[var(--lp-muted)]">{COUPANG_DISCLOSURE}</p>
          </div>
        </div>
      );
    }

    /* ── 후원하기 — 송금 링크로 나가는 강조 버튼. 응원 문구는 버튼 아래 작게 ── */
    case "donation": {
      if (!s(d, "url")) return null;
      return (
        <div>
          <a
            href={goHref(slug, block.id)}
            {...ext}
            className="lp-btn flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-5 py-3 text-center text-[15px] font-semibold text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)]"
          >
            {s(d, "emoji") ? <span aria-hidden>{s(d, "emoji")}</span> : null}
            {s(d, "label") || t.donate}
          </a>
          {s(d, "message") ? <p className="mt-1.5 text-center text-[12px] text-[var(--lp-muted)]">{s(d, "message")}</p> : null}
        </div>
      );
    }

    case "map": {
      const address = s(d, "address");
      if (!address) return null;
      return (
        <a
          href={`https://map.kakao.com/link/search/${encodeURIComponent(address)}`}
          {...ext}
          className={`lp-btn ${cardCls} block min-h-[56px] px-4 py-3.5`}
        >
          <p className="text-[15px] font-semibold text-[var(--lp-fg)]">{s(d, "label") || t.map}</p>
          <p className="mt-1 text-[14px] text-[var(--lp-muted)]">{address}</p>
        </a>
      );
    }

    default:
      return null;
  }
}
