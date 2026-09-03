"use client";

import { useEffect, useState } from "react";
import { NoticeBar } from "./notice-bar";

/*
  결과 배너 — 서버 액션이 쿼리(?planChanged=1, ?err=save, ?connect=success …)로 넘긴 결과를 보여주고,
  새로고침마다 다시 뜨지 않게 표시 직후 쿼리를 URL 에서 지운다(2026-08-14 결제 감사 → 2026-09-03 설정 전체로 승격).
  URL 을 지워 props 가 비어도 배너는 로컬 상태로 남는다.

  URL 정리는 history.replaceState 로 한다 — router.replace 는 RSC 재조회를 일으켜 페이지 로더가 한 번 더 돈다
  (설정 화면은 로더가 3~5개 병렬이라 그 왕복이 눈에 보였다). Next 14.1+ 는 replaceState 를 라우터 상태와 동기화한다.
  한 번에 하나만 그린다(error > warning > notice) — 두 띠가 겹치면 어느 것이 «방금 일»인지 안 읽힌다.
*/
export function ResultBanner({
  notice,
  error,
  warning,
  detail,
  path,
}: {
  notice?: string | null;
  error?: string | null;
  warning?: string | null;
  /** 운영자에게만 보여주는 원문(호출측이 owner 판정 뒤에만 넘긴다) — 고객 화면엔 안 나간다 */
  detail?: string | null;
  /** 쿼리를 지운 뒤 남길 주소 */
  path: string;
}) {
  const incoming = { notice: notice ?? null, error: error ?? null, warning: warning ?? null, detail: detail ?? null };
  const [current, setCurrent] = useState(incoming);
  /* 새 결과가 props 로 들어오면 렌더 중 상태 조정(React 공식 패턴) — effect 안 setState 금지 규칙 준수 */
  const hasIncoming = Boolean(incoming.notice || incoming.error || incoming.warning);
  if (
    hasIncoming &&
    (incoming.notice !== current.notice || incoming.error !== current.error || incoming.warning !== current.warning)
  ) {
    setCurrent(incoming);
  }

  useEffect(() => {
    if (hasIncoming) window.history.replaceState(null, "", path);
  }, [hasIncoming, path]);

  const tone = current.error ? "negative" : current.warning ? "warning" : current.notice ? "positive" : null;
  if (!tone) return null;
  const text = current.error ?? current.warning ?? current.notice;
  return (
    <NoticeBar tone={tone}>
      {text}
      {current.detail ? <p className="mt-2 break-all font-mono text-[12px] leading-relaxed opacity-80">{current.detail}</p> : null}
    </NoticeBar>
  );
}
