import { youtubeEmbed } from "@/lib/links";
import type { BlockType } from "@/lib/links/blocks";
import { COUPANG_DISCLOSURE } from "@/lib/links/blocks";
import { Collapsible } from "./collapsible";

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
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${inherit ? "" : "text-[var(--lp-accent)]"}`}
          style={{ backgroundColor: inherit ? "color-mix(in srgb, currentColor 16%, transparent)" : "color-mix(in srgb, var(--lp-accent) 14%, transparent)" }}
        >
          #{t}
        </span>
      ))}
    </span>
  );
}

/** 판매가·정가 — 표시용 문자열 그대로. 정가는 취소선 */
function Price({ d, size = "md", inherit = false }: { d: Record<string, unknown>; size?: "sm" | "md"; inherit?: boolean }) {
  const price = s(d, "price");
  if (!price) return null;
  const orig = s(d, "originalPrice");
  return (
    <span className={`tnum mt-1 flex items-baseline gap-1.5 ${size === "sm" ? "text-[13px]" : "text-[15px]"}`}>
      <span className={`font-bold ${inherit ? "" : "text-[var(--lp-fg)]"}`}>{price}</span>
      {orig ? <span className={`text-[12px] line-through ${inherit ? "opacity-70" : "text-[var(--lp-muted)]"}`}>{orig}</span> : null}
    </span>
  );
}

export function BlockRenderer({ block, slug }: { block: SnapshotBlock; slug: string }) {
  const d = block.data ?? {};
  const type = block.type as BlockType;

  switch (type) {
    /* ── 링크 버튼 ─────────────────────────────────────────── */
    case "link": {
      /* 주소가 비면 **아예 그리지 않는다.** <a> 로 그리면 /p/{slug}/go/{id} 가
         목적지를 못 찾고 같은 페이지로 되던져서, 방문자에게는 "눌렀는데 새로고침만
         된" 것으로 보인다. 새 페이지에 기본으로 깔리는 빈 「새 링크」가 그대로
         발행되는 게 가장 흔한 경로다. */
      if (!s(d, "url")) return null;
      const label = s(d, "label") || "링크";
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
            rel="noopener noreferrer nofollow"
            className={`lp-btn ${cardCls} overflow-hidden transition-opacity hover:opacity-90 ${big ? "" : "flex items-center gap-3 p-3"}`}
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
              <Price d={d} size={big ? "md" : "sm"} />
              <Tags d={d} align={big ? "center" : "start"} />
            </span>
          </a>
        );
      }
      const hasExtras = s(d, "price") || (Array.isArray(d.tags) && (d.tags as unknown[]).length > 0);
      return (
        <a
          href={goHref(slug, block.id)}
          rel="noopener noreferrer nofollow"
          style={textStyle}
          className={[
            "lp-btn flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[var(--lp-radius-btn)] px-5 py-3 text-center text-[15px] font-semibold transition-opacity hover:opacity-85",
            hasExtras ? "flex-col gap-0.5" : "",
            primary
              ? "bg-[var(--lp-accent)] text-[var(--lp-on-accent)]"
              : outline
                ? "border-2 border-[var(--lp-accent)] bg-transparent text-[var(--lp-accent)]"
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
      return <h2 className="pt-2 text-[17px] font-bold text-[var(--lp-fg)]">{s(d, "text")}</h2>;

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
      const img = (
        // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL. 방문자 페이지라 최적화 프록시를 안 태운다
        <img
          src={src}
          alt={s(d, "alt")}
          className="w-full rounded-[var(--lp-radius)] border border-[var(--lp-border)] object-cover"
          loading="lazy"
        />
      );
      return url ? (
        /* 대체 텍스트가 비면 링크 이름이 비어 스크린리더가 경로만 읽는다 — 최소한의 이름을 준다(감사 #21) */
        <a
          href={goHref(slug, block.id)}
          rel="noopener noreferrer nofollow"
          className="block"
          aria-label={s(d, "alt") ? undefined : "이미지 링크"}
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
              <span className="mt-3 flex min-h-[40px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-4 text-[14px] font-semibold text-[var(--lp-on-accent)]">
                {cta}
              </span>
            ) : null}
          </div>
        </div>
      );
      return url ? (
        <a href={goHref(slug, block.id)} rel="noopener noreferrer nofollow" className="block">
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
            rel="noopener noreferrer nofollow"
            className={`${cardCls} flex min-h-[52px] items-center justify-center px-5 py-3 text-[15px] font-semibold text-[var(--lp-fg)]`}
          >
            ▶ {s(d, "title") || "영상 보러 가기"}
          </a>
        );
      }
      return (
        <div className={`${cardCls} overflow-hidden`}>
          <iframe
            src={embed}
            title={s(d, "title") || "동영상"}
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
                rel="noopener noreferrer nofollow"
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
        <a key={i} href={goHref(slug, block.id, i)} rel="noopener noreferrer nofollow" className={`lp-btn ${cardCls} flex items-center gap-3 p-3`}>
          {s(it, "imagePath") ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
            <img src={s(it, "imagePath")} alt="" className="size-14 shrink-0 rounded-[calc(var(--lp-radius)/1.6)] object-cover" loading="lazy" />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-[var(--lp-fg)]">{s(it, "title")}</span>
            {s(it, "subtitle") ? <span className="mt-0.5 block truncate text-[14px] text-[var(--lp-muted)]">{s(it, "subtitle")}</span> : null}
            <Price d={it} size="sm" />
          </span>
        </a>
      ));
      return <Collapsible items={nodes} initial={n(d, "collapse", 0)} className="space-y-2.5" />;
    }

    case "grid": {
      /* card_row 와 같은 이유·같은 규칙 — 원본 인덱스를 유지한 채 주소 없는 항목만 뺀다 */
      const items = arr(d, "items").map((it, i) => ({ it, i })).filter(({ it }) => s(it, "url"));
      if (items.length === 0) return null;
      const cols = n(d, "columns", 2) === 3 ? "grid-cols-3" : "grid-cols-2";
      const nodes = items.map(({ it, i }) => (
        <a key={i} href={goHref(slug, block.id, i)} rel="noopener noreferrer nofollow" className={`lp-btn ${cardCls} overflow-hidden`}>
          {s(it, "imagePath") ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
            <img src={s(it, "imagePath")} alt="" className="aspect-square w-full object-cover" loading="lazy" />
          ) : null}
          <span className="block px-2.5 py-2 text-center text-[14px] font-medium text-[var(--lp-fg)]">
            {s(it, "title")}
            <Price d={it} size="sm" />
          </span>
        </a>
      ));
      return <Collapsible items={nodes} initial={n(d, "collapse", 0)} className={`grid gap-2.5 ${cols}`} />;
    }

    case "notice": {
      const tone = s(d, "tone") || "info";
      return (
        <div
          className={[
            "rounded-[var(--lp-radius)] px-4 py-3 text-[14px] leading-[1.6]",
            tone === "primary"
              ? "bg-[var(--lp-accent)] text-[var(--lp-on-accent)]"
              : "border border-[var(--lp-border)] bg-[var(--lp-card)] text-[var(--lp-fg)]",
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
        <div className="grid grid-cols-3 gap-1.5">
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
                rel="noopener noreferrer nofollow"
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
            <span className="inline-block rounded-full bg-[var(--lp-accent)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--lp-on-accent)]">
              쿠팡 파트너스
            </span>
            <p className="mt-1.5 text-[15px] font-semibold text-[var(--lp-fg)]">{s(d, "title") || "상품 보러 가기"}</p>
            {s(d, "price") ? <p className="tnum mt-0.5 text-[17px] font-bold text-[var(--lp-fg)]">{s(d, "price")}</p> : null}
            <a
              href={goHref(slug, block.id)}
              rel="noopener noreferrer nofollow"
              className="mt-2.5 flex min-h-[44px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-4 text-[14px] font-semibold text-[var(--lp-on-accent)] transition-opacity hover:opacity-85"
            >
              쿠팡에서 보기
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
            rel="noopener noreferrer nofollow"
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-5 py-3 text-center text-[15px] font-semibold text-[var(--lp-on-accent)] transition-opacity hover:opacity-85"
          >
            {s(d, "emoji") ? <span aria-hidden>{s(d, "emoji")}</span> : null}
            {s(d, "label") || "후원하기"}
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
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={`${cardCls} block px-4 py-3.5`}
        >
          <p className="text-[15px] font-semibold text-[var(--lp-fg)]">{s(d, "label") || "찾아오시는 길"}</p>
          <p className="mt-1 text-[14px] text-[var(--lp-muted)]">{address}</p>
        </a>
      );
    }

    default:
      return null;
  }
}
