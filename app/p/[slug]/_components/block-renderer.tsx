import type { BlockType } from "@/lib/links/blocks";

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

/** 유튜브·틱톡 URL → 임베드 주소. 모르는 주소면 null(링크 버튼으로 대체) */
function embedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith("/shorts/")) return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
    }
    return null;
  } catch {
    return null;
  }
}

const cardCls =
  "block rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] shadow-[var(--lp-shadow)]";

export function BlockRenderer({ block, slug }: { block: SnapshotBlock; slug: string }) {
  const d = block.data ?? {};
  const type = block.type as BlockType;

  switch (type) {
    /* ── 링크 버튼 ─────────────────────────────────────────── */
    case "link": {
      const label = s(d, "label") || "링크";
      const emoji = s(d, "emoji");
      const emphasis = s(d, "emphasis") || "normal";
      const primary = emphasis === "primary";
      const outline = emphasis === "outline";
      return (
        <a
          href={goHref(slug, block.id)}
          rel="noopener noreferrer nofollow"
          className={[
            "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[var(--lp-radius)] px-5 py-3 text-center text-[15px] font-semibold transition-opacity hover:opacity-85",
            primary
              ? "bg-[var(--lp-accent)] text-[var(--lp-on-accent)]"
              : outline
                ? "border-2 border-[var(--lp-accent)] bg-transparent text-[var(--lp-accent)]"
                : "border border-[var(--lp-border)] bg-[var(--lp-card)] text-[var(--lp-fg)] shadow-[var(--lp-shadow)]",
          ].join(" ")}
        >
          {emoji ? <span aria-hidden>{emoji}</span> : null}
          {label}
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
        <a href={goHref(slug, block.id)} rel="noopener noreferrer nofollow" className="block">
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
      const inner = (
        <div className={`${cardCls} overflow-hidden`}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
            <img src={src} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
          ) : null}
          <div className="px-4 py-3.5">
            <p className="text-[15px] font-semibold text-[var(--lp-fg)]">{title}</p>
            {sub ? <p className="mt-1 text-[14px] text-[var(--lp-muted)]">{sub}</p> : null}
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
      const embed = embedUrl(url);
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
      const items = arr(d, "items");
      if (items.length === 0) return null;
      return (
        <div className="space-y-2.5">
          {items.map((it, i) => (
            <a
              key={i}
              href={goHref(slug, block.id, i)}
              rel="noopener noreferrer nofollow"
              className={`${cardCls} flex items-center gap-3 p-3`}
            >
              {s(it, "imagePath") ? (
                // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
                <img
                  src={s(it, "imagePath")}
                  alt=""
                  className="size-14 shrink-0 rounded-[calc(var(--lp-radius)/1.6)] object-cover"
                  loading="lazy"
                />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-[var(--lp-fg)]">
                  {s(it, "title")}
                </span>
                {s(it, "subtitle") ? (
                  <span className="mt-0.5 block truncate text-[14px] text-[var(--lp-muted)]">
                    {s(it, "subtitle")}
                  </span>
                ) : null}
              </span>
            </a>
          ))}
        </div>
      );
    }

    case "grid": {
      const items = arr(d, "items");
      if (items.length === 0) return null;
      const cols = n(d, "columns", 2) === 3 ? "grid-cols-3" : "grid-cols-2";
      return (
        <div className={`grid gap-2.5 ${cols}`}>
          {items.map((it, i) => (
            <a
              key={i}
              href={goHref(slug, block.id, i)}
              rel="noopener noreferrer nofollow"
              className={`${cardCls} overflow-hidden`}
            >
              {s(it, "imagePath") ? (
                // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
                <img src={s(it, "imagePath")} alt="" className="aspect-square w-full object-cover" loading="lazy" />
              ) : null}
              <span className="block px-2.5 py-2 text-center text-[14px] font-medium text-[var(--lp-fg)]">
                {s(it, "title")}
              </span>
            </a>
          ))}
        </div>
      );
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
