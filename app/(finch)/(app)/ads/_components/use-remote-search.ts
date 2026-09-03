"use client";

import { useEffect, useState } from "react";
import type { AdsWriteFailCode } from "@/lib/ads/campaign-rules";

/*
  서버 검색 훅 — 시·도·관심사 피커가 같이 쓴다.
  - 최소 2자 · 400ms 디바운스 · 세션 캐시(같은 질의는 Graph 를 다시 안 부른다) — 스펙 §13-17.
  - 서버가 pauseSeconds 를 주면(점수 70%↑) 그동안 새 요청을 보내지 않는다. 레이트리밋 응답도 60초 쉰다.
  - 실패(«확인 못 함»)와 0건(«일치하는 것 없음»)을 status 로 가른다 — 화면이 다른 문구를 쓴다.
  - 상태 갱신은 전부 타이머·await 뒤에서만 한다(effect 본문에서 동기 setState 를 하지 않는다 — 컴파일러 린트).
*/

export type RemoteSearchStatus = "idle" | "short" | "loading" | "ok" | "error" | "paused";
export type RemoteSearchResponse<T> = { ok: true; items: T[]; pauseSeconds: number } | { ok: false; code: AdsWriteFailCode };

export const QUERY_MIN_CHARS = 2;
const DEBOUNCE_MS = 400;
const RATE_LIMIT_PAUSE_MS = 60_000;
const CACHE_MAX = 200;

/* 세션 캐시 — 모듈 스코프라 탭을 닫으면 사라진다. DB 에는 넣지 않는다(§6.2) */
const cache = new Map<string, unknown[]>();
const pausedUntil = new Map<string, number>();

function remember(key: string, items: unknown[]) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, items);
}

interface Settled<T> {
  q: string;
  status: "ok" | "error" | "paused";
  items: T[];
  errorCode: AdsWriteFailCode | null;
}

/**
 * @param kind   캐시·일시정지 키 접두("region"·"interest")
 * @param search 모듈 스코프의 안정된 함수여야 한다(서버 액션을 감싼 top-level 함수) — 렌더마다 새로 만들면 매 렌더 재요청한다
 */
export function useRemoteSearch<T>(kind: string, search: (q: string) => Promise<RemoteSearchResponse<T>>) {
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  const q = query.trim();

  useEffect(() => {
    if (q.length < QUERY_MIN_CHARS) return;
    const key = `${kind}:${q}`;
    const cached = cache.get(key) as T[] | undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cached) {
        setSettled({ q, status: "ok", items: cached, errorCode: null });
        return;
      }
      if ((pausedUntil.get(kind) ?? 0) > Date.now()) {
        setSettled({ q, status: "paused", items: [], errorCode: "search_paused" });
        return;
      }
      const res = await search(q);
      if (cancelled) return;
      if (!res.ok) {
        if (res.code === "search_paused") pausedUntil.set(kind, Date.now() + RATE_LIMIT_PAUSE_MS);
        setSettled({ q, status: res.code === "search_paused" ? "paused" : "error", items: [], errorCode: res.code });
        return;
      }
      remember(key, res.items);
      if (res.pauseSeconds > 0) pausedUntil.set(kind, Date.now() + res.pauseSeconds * 1000);
      setSettled({ q, status: "ok", items: res.items, errorCode: null });
    }, cached ? 0 : DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, kind, search]);

  /* 표시 상태는 파생값이다 — 질의가 바뀌면 settled 가 옛 질의 것이라 «loading» 으로 읽힌다 */
  let status: RemoteSearchStatus;
  if (q.length === 0) status = "idle";
  else if (q.length < QUERY_MIN_CHARS) status = "short";
  else if (settled && settled.q === q) status = settled.status;
  else status = "loading";

  const current = settled && settled.q === q ? settled : null;
  return {
    query,
    setQuery,
    status,
    items: current?.items ?? ([] as T[]),
    errorCode: current?.errorCode ?? null,
  };
}
