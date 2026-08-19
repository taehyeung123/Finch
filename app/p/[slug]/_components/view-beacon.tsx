"use client";

import { useEffect, useRef } from "react";
import { recordView } from "../actions";

/*
  방문 집계 비콘.

  서버 컴포넌트에서 바로 기록하지 않는 이유: 렌더 중 쓰기는 프리렌더·캐시와 싸우고,
  봇 크롤링·프리페치까지 방문으로 잡힌다. 클라이언트에서 **마운트 후 한 번**만 쏜다.

  StrictMode 는 개발에서 effect 를 두 번 돌린다 — ref 가드로 중복 집계를 막는다.
*/
export function ViewBeacon({ slug }: { slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    /* 실패해도 아무 일도 하지 않는다 — 방문자는 통계를 남기러 온 게 아니다 */
    void recordView(slug).catch(() => {});
  }, [slug]);
  return null;
}
