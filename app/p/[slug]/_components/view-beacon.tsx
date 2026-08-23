"use client";

import { useEffect, useRef } from "react";
import { recordView } from "../actions";

/*
  방문 집계 비콘.

  서버 컴포넌트에서 바로 기록하지 않는 이유: 렌더 중 쓰기는 프리렌더·캐시와 싸우고,
  봇 크롤링·프리페치까지 방문으로 잡힌다. 클라이언트에서 **마운트 후 한 번**만 쏜다.

  StrictMode 는 개발에서 effect 를 두 번 돌린다 — ref 가드로 중복 집계를 막는다.

  리퍼러는 document.referrer 를 **직접 보낸다** — 서버 액션 요청의 Referer 헤더는 이 페이지 자신이라
  서버에서 읽으면 100% null 이었다(감사 C10). 서버는 호스트명만 남긴다.

  체류시간(0058): **보이는 시간만** 더한다 — 탭을 숨긴 25분을 세면 평균 체류가 거짓이 된다(감사 C12).
  숨기거나 떠날 때(pagehide·visibilitychange) keepalive 로 /dwell 에 보내고, 서버는 최댓값만 남긴다.
*/
export function ViewBeacon({ slug }: { slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    /* 실패해도 아무 일도 하지 않는다 — 방문자는 통계를 남기러 온 게 아니다 */
    const src = new URLSearchParams(window.location.search).get("src") ?? undefined;
    const ref = document.referrer || undefined;
    void recordView(slug, src, ref).catch(() => {});
  }, [slug]);

  useEffect(() => {
    let acc = 0;
    let visibleSince: number | null = document.visibilityState === "hidden" ? null : performance.now();
    let lastSent = 0;
    const elapsed = () => acc + (visibleSince !== null ? performance.now() - visibleSince : 0);
    const send = () => {
      const ms = Math.round(elapsed());
      /* 5초 미만 차이는 다시 보내지 않는다 — 탭 전환마다 요청이 가는 걸 막는다 */
      if (ms < 1000 || ms - lastSent < 5000) return;
      lastSent = ms;
      try {
        void fetch(`/p/${encodeURIComponent(slug)}/dwell`, {
          method: "POST",
          keepalive: true,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ms }),
        }).catch(() => {});
      } catch {
        /* keepalive 미지원 환경 — 포기 */
      }
    };
    const onVis = () => {
      const now = performance.now();
      if (document.visibilityState === "hidden") {
        if (visibleSince !== null) {
          acc += now - visibleSince;
          visibleSince = null;
        }
        send();
      } else if (visibleSince === null) {
        visibleSince = now;
      }
    };
    window.addEventListener("pagehide", send);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", send);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [slug]);
  return null;
}
