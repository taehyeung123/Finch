/*
  인포크링크(link.inpock.co.kr) 파서 — 순수 함수. 네트워크를 쓰지 않는다.

  실측(2026-08-20): Next.js pages 라우터라 __NEXT_DATA__ JSON 에 페이지 전체가 있다.
   · props.pageProps: { username, design{ title, bio, sns[] }, blocks[] }
   · 블록: { block_type, title, url, links?: [{ title, url }] }
   · url 은 /api/r/{token} 추적 리다이렉트 또는 절대 URL — 해석(Location 읽기)은
     액션(importFromInpock)이 같은 상수 호스트에만 물어서 한다.
   · 없는 별칭도 SPA 셸이 200 으로 오지만 __NEXT_DATA__ 의 page 가 "/404" 다.
*/

const MAX_CANDIDATES = 100;

type Candidate = { label: string; url: string };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseInpockHtml(
  html: string,
): { notFound: boolean; pageTitle: string | null; candidates: Candidate[] } | null {
  const m = /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;

  let root: unknown;
  try {
    root = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!root || typeof root !== "object") return null;

  const r = root as { page?: unknown; props?: { pageProps?: unknown } };
  const pp = r.props && typeof r.props === "object" ? (r.props as { pageProps?: unknown }).pageProps : undefined;
  if (r.page === "/404" || !pp || typeof pp !== "object" || !str((pp as Record<string, unknown>).username)) {
    return { notFound: true, pageTitle: null, candidates: [] };
  }

  const page = pp as Record<string, unknown>;
  const design = page.design && typeof page.design === "object" ? (page.design as Record<string, unknown>) : {};
  const pageTitle = str(design.title) || null;

  const candidates: Candidate[] = [];
  const push = (label: unknown, url: unknown) => {
    const u = str(url);
    if (!u || candidates.length >= MAX_CANDIDATES) return;
    candidates.push({ label: str(label) || "링크", url: u });
  };

  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    push(b.title, b.url);
    if (Array.isArray(b.links)) {
      for (const lRaw of b.links) {
        if (!lRaw || typeof lRaw !== "object") continue;
        const l = lRaw as Record<string, unknown>;
        push(l.title, l.url);
      }
    }
  }

  return { notFound: false, pageTitle, candidates };
}
