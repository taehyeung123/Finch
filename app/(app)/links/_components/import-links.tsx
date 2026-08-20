"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { parsePastedLinks, type HarvestedLink } from "@/lib/links";
import { importFromInpock, importFromLittly } from "../actions";

/*
  다른 서비스에서 링크 옮겨오기 — 기본은 **붙여넣기**, 리틀리·인포크는 **주소 가져오기**.

  임의 URL 서버 fetch 는 안 만든다(이유는 lib/links/index.ts 상단 — DNS 리바인딩을
  fetch 로는 못 막고, Vercel 방화벽은 전부 인바운드다). 예외는 상수 호스트 화이트리스트
  둘뿐이다: 리틀리(litt.ly, 2026-08-19 사장님 승인)와 인포크(link.inpock.co.kr,
  2026-08-20 — robots 가 프로필을 허용하고 __NEXT_DATA__ 가 구조화돼 실측 검증).
  링크트리는 robots 전면 거부(User-agent:* Disallow:/)라 계속 제외한다.
  상세는 actions.ts 의 importFromLittly·importFromInpock 주석.

  붙여넣기 사용법: 기존 링크 페이지를 브라우저에서 열고 → 전체 선택(Ctrl+A) → 복사 →
  여기 붙여넣기. 브라우저가 클립보드에 HTML 을 함께 넣어주므로 <a> 를 그대로 건진다.
  HTML 이 없으면 "이름 | 주소" 줄 파싱으로 떨어진다.

  두 경로 모두 **같은 검증 관문**(parsePastedLinks)과 같은 선택 표를 쓴다.
*/

/**
 * 가져오기 본체 — 두 자리에서 쓴다:
 *  · 첫 화면(페이지 없음): 「기존 링크 가져오기」로 펼쳐진 채 — 가져온 링크로 페이지를 만든다
 *  · 빌더 블록 탭: 접이식(ImportLinks)으로 — 기존 페이지에 뒤에 붙인다
 * actionLabel 만 다르고 검증·표·경고는 완전히 같다.
 */
export function ImportLinksBody({
  busy,
  onImport,
  actionLabel = "추가하기",
}: {
  busy: boolean;
  /**
   * clear 는 **성공했을 때만** 부를 것 — 즉시 비우면 실패 시 고른 목록·고친 이름이
   * 통째로 사라진다. 붙여넣기 경로는 원문이 textarea 에 안 남아(파싱만 한다)
   * 복구하려면 원래 서비스에서 다시 복사해 와야 했다.
   */
  onImport: (items: Array<{ label: string; url: string }>, clear: () => void) => void;
  /** 적용 버튼 문구 — "{n}개 " 뒤에 붙는다 */
  actionLabel?: string;
}) {
  const [found, setFound] = useState<HarvestedLink[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [littly, setLittly] = useState("");
  const [fetching, setFetching] = useState(false);

  /** 건진 후보를 표에 얹는다 — 붙여넣기·주소 가져오기 경로가 같은 표를 쓴다 */
  function showLinks(links: HarvestedLink[], emptyNote: string) {
    setFound(links);
    setPicked(new Set(links.map((_, i) => i).filter((i) => !links[i].tracking)));
    setLabels({});
    setNote(links.length === 0 ? emptyNote : null);
  }

  async function pullByAddress() {
    if (fetching || !littly.trim()) return;
    setFetching(true);
    setNote(null);
    try {
      /* 주소로 서비스 판별 — 인포크 도메인이 보이면 인포크, 나머지는 리틀리 규칙.
         아이디만 넣으면 리틀리로 간다(입력칸 안내가 그렇게 말한다). */
      const res = littly.toLowerCase().includes("inpock")
        ? await importFromInpock(littly)
        : await importFromLittly(littly);
      if (!res.ok || !res.links) {
        setNote(res.error ?? "가져오지 못했어요.");
        return;
      }
      /* 검증은 붙여넣기와 **같은 관문**(parsePastedLinks) — http 만·중복 제거·
         추적 파라미터 제거·추적 주소 경고. sourceHost 는 안 넘긴다: 리틀리 페이로드에는
         사이트 장식(푸터·로고)이 없고 전부 주인이 깐 블록이라, litt.ly/* 로 가는
         링크도 주인이 의도한 진짜 링크다(실측: 매거진 페이지가 다른 리틀리 페이지
         66개를 링크한다). */
      const links = parsePastedLinks({
        text: "",
        anchors: res.links.map((l) => ({ href: l.url, label: l.label })),
        max: 100,
      });
      showLinks(links, "그 페이지에서 가져올 링크를 찾지 못했어요.");
    } catch {
      setNote("가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setFetching(false);
    }
  }

  function harvest(text: string, html: string) {
    let anchors: Array<{ href: string; label: string }> = [];
    let sourceHost: string | undefined;

    if (html) {
      /* DOMParser 로 만든 문서는 **렌더되지 않는다** — 스크립트도 안 돌고 이미지도
         안 불러온다. 여기서는 href·텍스트만 읽고 버린다. */
      try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        anchors = [...doc.querySelectorAll("a[href]")].map((a) => ({
          href: a.getAttribute("href") ?? "",
          label: (a.textContent ?? "").trim(),
        }));
        /* 클립보드 HTML 에 <base> 가 실려 오면 출처를 알 수 있다 — 그 사이트 자신의
           링크(로고·약관·푸터)를 걸러내는 근거가 된다. */
        const base = doc.querySelector("base[href]")?.getAttribute("href");
        if (base) sourceHost = new URL(base).hostname;
      } catch {
        /* HTML 을 못 읽으면 줄 파싱으로 떨어진다 — 그게 안전망의 존재 이유다 */
      }
    }

    /* 출처를 못 찾았으면 **가장 많이 나온 호스트**를 원본으로 본다. 링크트리 페이지를
       통째로 복사하면 그쪽 자체 링크가 압도적으로 많다(실측 133개 중 113개). */
    if (!sourceHost && anchors.length > 6) {
      const tally = new Map<string, number>();
      for (const a of anchors) {
        try {
          const h = new URL(a.href, "https://x.invalid").hostname;
          if (h && h !== "x.invalid") tally.set(h, (tally.get(h) ?? 0) + 1);
        } catch {
          /* 상대 경로 등 — 셈에서 뺀다 */
        }
      }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= anchors.length * 0.4) sourceHost = top[0];
    }

    const links = parsePastedLinks({ text, anchors, sourceHost });
    showLinks(
      links,
      "링크를 못 찾았어요. 기존 페이지를 열어 전체 선택(Ctrl+A) 후 복사해 붙여넣거나, 한 줄에 하나씩 「이름 | 주소」로 적어 주세요.",
    );
  }

  const chosen = (found ?? []).filter((_, i) => picked.has(i));

  return (
    <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-fg-sub">
          쓰던 링크 페이지를 열어 <strong className="font-semibold text-fg">전체 선택(Ctrl+A) → 복사</strong> 한 뒤
          아래에 붙여넣으세요. 한 줄에 하나씩 <code className="text-[12px]">이름 | 주소</code> 로 적어도 됩니다.
        </p>

        {/* 리틀리·인포크는 주소만으로 가져온다 — 서버가 페이지의 data 페이로드를
            읽는다(actions.ts, 상수 호스트 화이트리스트가 서버 fetch 의 전부). */}
        <div className="flex items-center gap-1.5">
          <input
            value={littly}
            onChange={(e) => setLittly(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void pullByAddress();
              }
            }}
            placeholder="litt.ly/아이디 · link.inpock.co.kr/아이디"
            aria-label="리틀리·인포크 주소"
            className="h-9 min-w-0 flex-1 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
          />
          <Button size="sm" variant="secondary" disabled={fetching || !littly.trim()} onClick={() => void pullByAddress()}>
            {fetching ? "가져오는 중…" : "주소로 가져오기"}
          </Button>
        </div>

        <p className="text-[12px] text-fg-sub">다른 서비스는 아래에 붙여넣으세요.</p>

        <textarea
          rows={3}
          aria-label="붙여넣을 링크"
          placeholder="여기에 붙여넣기"
          onPaste={(e) => {
            const text = e.clipboardData.getData("text/plain");
            const html = e.clipboardData.getData("text/html");
            /* 큰 페이지를 통째로 붙이면 textarea 가 수천 줄이 된다 — 값은 안 넣고
               파싱만 한다. 결과 표가 곧 사용자가 보는 것이다. */
            e.preventDefault();
            harvest(text, html);
          }}
          onChange={(e) => harvest(e.target.value, "")}
          className="w-full rounded-card border border-line bg-body px-3 py-2 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />

        {note ? <p className="text-[12px] leading-relaxed text-fg-sub">{note}</p> : null}

        {found && found.length > 0 ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-fg-sub">
                찾은 링크 <span className="tnum">{found.length}</span>개 · 선택{" "}
                <span className="tnum">{chosen.length}</span>
              </p>
              <button
                type="button"
                onClick={() =>
                  setPicked(picked.size === found.length ? new Set() : new Set(found.map((_, i) => i)))
                }
                className="trans-state text-[12px] text-fg-sub underline underline-offset-2 hover:text-fg"
              >
                {picked.size === found.length ? "전체 해제" : "전체 선택"}
              </button>
            </div>

            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {found.map((l, i) => (
                <li key={i} className="rounded-card border border-line px-2.5 py-2">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={picked.has(i)}
                      onChange={(e) =>
                        setPicked((p) => {
                          const next = new Set(p);
                          if (e.target.checked) next.add(i);
                          else next.delete(i);
                          return next;
                        })
                      }
                      className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <input
                        value={labels[i] ?? l.label}
                        onChange={(e) => setLabels((m) => ({ ...m, [i]: e.target.value }))}
                        placeholder="버튼 이름"
                        aria-label={`${i + 1}번째 링크 이름`}
                        maxLength={40}
                        className="h-8 w-full rounded-card border border-line bg-body px-2 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
                      />
                      <span className="mt-1 block truncate text-[12px] text-fg-sub">{l.url}</span>
                      {/* 추적 주소는 기본으로 꺼둔다 — 자동 임포트를 파는 쪽은 이걸 말해주지 않는다 */}
                      {l.tracking ? (
                        <span className="mt-1 block text-[12px] text-negative-strong">
                          다른 서비스의 추적 주소예요. 그대로 넣으면 클릭이 그쪽에 계속 집계되고, 그 서비스를
                          해지하면 링크가 죽어요.
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <Button
              size="sm"
              disabled={busy || chosen.length === 0}
              onClick={() =>
                onImport(
                  (found ?? [])
                    .map((l, i) => ({ label: labels[i] ?? l.label, url: l.url, i }))
                    .filter((x) => picked.has(x.i))
                    .map(({ label, url }) => ({ label, url })),
                  () => {
                    setFound(null);
                    setPicked(new Set());
                    setLabels({});
                  },
                )
              }
              className={cn(chosen.length === 0 && "opacity-60")}
            >
              {busy ? "처리 중…" : `${chosen.length}개 ${actionLabel}`}
            </Button>
          </>
        ) : null}
    </div>
  );
}

/** 빌더 블록 탭용 접이식 래퍼 */
export function ImportLinks({
  busy,
  onImport,
}: {
  busy: boolean;
  onImport: (items: Array<{ label: string; url: string }>, clear: () => void) => void;
}) {
  return (
    <details className="rounded-card border border-line">
      <summary className="cursor-pointer px-3 py-2 text-[14px] font-semibold">
        <Download className="mr-1 inline size-3.5" aria-hidden />
        링크 여러 개 한 번에
      </summary>
      <div className="px-3 pb-3">
        <ImportLinksBody busy={busy} onImport={onImport} />
      </div>
    </details>
  );
}
