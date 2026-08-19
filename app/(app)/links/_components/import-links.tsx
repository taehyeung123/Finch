"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { parsePastedLinks, type HarvestedLink } from "@/lib/links";

/*
  다른 서비스에서 링크 옮겨오기 — **붙여넣기**로 한다.

  링크팜·Beacons 는 "주소만 넣으면 자동으로 가져오기"를 판다. 우리는 안 만들었다.
  이유는 lib/links/index.ts 상단에 길게 적어놨는데 요약하면:
   · 서버가 남의 주소를 여는 건 SSRF 다. Node fetch 로는 DNS 리바인딩을 막을 수 없고
     Vercel 방화벽은 전부 인바운드라 애플리케이션 코드가 유일한 방어선이다.
   · 정작 긁을 수 있는 곳이 거의 없다 — 링크트리는 robots 가 전면 거부,
     인포크는 목적지가 페이로드에 없고, 링크팜은 Flutter 라 DOM 이 없다.
   · 붙여넣기면 조작 4번이고 서버가 아무 데도 나가지 않는다.

  실제 사용법: 기존 링크 페이지를 브라우저에서 열고 → 전체 선택(Ctrl+A) → 복사 →
  여기 붙여넣기. 브라우저가 클립보드에 HTML 을 함께 넣어주므로 <a> 를 그대로 건진다.
  HTML 이 없으면 "이름 | 주소" 줄 파싱으로 떨어진다.
*/

export function ImportLinks({
  busy,
  onImport,
}: {
  busy: boolean;
  onImport: (items: Array<{ label: string; url: string }>) => void;
}) {
  const [found, setFound] = useState<HarvestedLink[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [note, setNote] = useState<string | null>(null);

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
    setFound(links);
    setPicked(new Set(links.map((_, i) => i).filter((i) => !links[i].tracking)));
    setLabels({});
    setNote(
      links.length === 0
        ? "링크를 못 찾았어요. 기존 페이지를 열어 전체 선택(Ctrl+A) 후 복사해 붙여넣거나, 한 줄에 하나씩 「이름 | 주소」로 적어 주세요."
        : null,
    );
  }

  const chosen = (found ?? []).filter((_, i) => picked.has(i));

  return (
    <details className="rounded-card border border-line">
      <summary className="cursor-pointer px-3 py-2 text-[14px] font-semibold">
        <Download className="mr-1 inline size-3.5" aria-hidden />
        링크 여러 개 한 번에
      </summary>

      <div className="space-y-3 px-3 pb-3">
        <p className="text-[12px] leading-relaxed text-fg-sub">
          쓰던 링크 페이지를 열어 <strong className="font-semibold text-fg">전체 선택(Ctrl+A) → 복사</strong> 한 뒤
          아래에 붙여넣으세요. 한 줄에 하나씩 <code className="text-[12px]">이름 | 주소</code> 로 적어도 됩니다.
        </p>

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
              onClick={() => {
                onImport(
                  (found ?? [])
                    .map((l, i) => ({ label: labels[i] ?? l.label, url: l.url, i }))
                    .filter((x) => picked.has(x.i))
                    .map(({ label, url }) => ({ label, url })),
                );
                setFound(null);
                setPicked(new Set());
                setLabels({});
              }}
              className={cn(chosen.length === 0 && "opacity-60")}
            >
              {busy ? "추가 중…" : `${chosen.length}개 추가하기`}
            </Button>
          </>
        ) : null}
      </div>
    </details>
  );
}
