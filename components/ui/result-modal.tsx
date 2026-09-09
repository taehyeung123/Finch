"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { NOTICE_ICON, NOTICE_ICON_COLOR, type NoticeTone } from "@/components/ui/notice-bar";
import { cn } from "@/lib/cn";

/*
  결과 모달 — «방금 한 일»의 결과를 모달로 알린다(2026-09-09 사장님 지시: 연동·해제 결과를 띠로 띄우지 말 것).

  왜 띠가 아니라 모달인가:
  · 연동은 **다른 사이트를 다녀와서** 끝난다. 돌아온 화면 맨 위에 초록 띠가 붙어 있으면
    «내가 방금 한 일의 결과»가 아니라 «원래 있던 안내»로 읽힌다 — 눈이 위로 안 간다.
  · 실패는 더 나쁘다. 해제 확인 모달이 열린 채로 실패 띠가 뜨면 띠가 스크림 **뒤**에 숨는다(그 버그가 실제로 있었다).
  결과를 화면 한가운데 한 번 세우고, 확인을 누르면 사라진다.

  두 가지 방식으로 쓴다 — 어느 쪽이든 «새 결과가 들어오면 다시 연다»는 같다.
  1) 쿼리 결과(OAuth 복귀·서버 액션 리다이렉트): `path` 를 주면 표시 직후 쿼리를 URL 에서 지운다.
     지우지 않으면 새로고침·뒤로가기마다 같은 모달이 다시 뜬다. router.replace 가 아니라
     history.replaceState 를 쓰는 이유는 ResultBanner 주석과 같다(RSC 재조회를 일으키지 않는다).
  2) 클라이언트 상태(로그인 계정 연결·해제): `onClose` 로 부모의 상태를 비운다.
*/
export interface ResultModalContent {
  tone: NoticeTone;
  /** 결과 한 문장 — 마침표 없이. 모달의 접근성 이름도 겸한다 */
  title: string;
  /** 이어서 할 일. 없으면 제목만 */
  description?: string | null;
  /** 운영자에게만 보여주는 원문(호출측이 owner 판정 뒤에만 넘긴다) — 고객 화면엔 안 나간다 */
  detail?: string | null;
}

export function ResultModal({
  result,
  arrivalId,
  path,
  onClose,
}: {
  result: ResultModalContent | null;
  /** «이 결과가 방금 도착했다»는 표식 — 서버 컴포넌트가 렌더마다 새로 만들어 넘긴다(아래 주석) */
  arrivalId?: string | null;
  /** 쿼리를 지운 뒤 남길 주소 — 쿼리로 결과를 받은 화면만 넘긴다 */
  path?: string;
  /** 부모가 결과를 상태로 들고 있을 때 비우기 */
  onClose?: () => void;
}) {
  /* «무엇이 새 결과인가»의 열쇠. 렌더 중 상태 조정(React 공식 패턴).

     ⚠️ 내용만으로는 못 가른다. 인스타를 끊고 이어서 스레드를 끊으면 둘 다 「연결을 해제했어요」이고,
     연결을 두 번 연속 취소하면 둘 다 「연결을 취소했어요」다. 내용 키만 쓰면 **두 번째가 조용히 사라진다** —
     이번 변경이 없애려던 바로 그 증상이다. 「리다이렉트가 서브트리를 리마운트해 주니 괜찮다」에 기대지 않는다:
     해제 성공은 그 행을 「연결하기」로 갈아 끼우므로 폼이 먼저 사라져 리마운트가 안 일어날 수 있다(순서 미확정).
     그래서 쿼리로 결과를 받는 화면은 **서버가 렌더마다 새로 만든 `arrivalId`** 를 열쇠로 쓴다 —
     서버 컴포넌트는 탐색이 있을 때만 다시 렌더되므로, 새 arrivalId = 새로 도착한 결과다.

     `arrivalId` 가 없는 화면(부모가 클라이언트 상태로 결과를 주는 로그인 계정 화면)은 내용 키를 쓰되,
     결과가 **null 을 한 번 거치면** 기억을 지운다 — 닫으면 부모가 상태를 비우므로, 같은 실패를 다시 시도해도 또 뜬다.
     ⚠️ `close()` 에서 곧바로 seen 을 비우면 안 된다 — result prop 이 그대로 남는 화면에서는 닫는 즉시
     `key !== seen` 이 다시 참이 되어 그 자리에서 도로 열린다. 「null 을 거쳤는가」로 판정해야 양쪽이 안전하다. */
  const key = result ? (arrivalId ?? `${result.tone}|${result.title}|${result.description ?? ""}|${result.detail ?? ""}`) : null;
  const [seen, setSeen] = useState(key);
  const [open, setOpen] = useState(key !== null);
  if (key !== null && key !== seen) {
    setSeen(key);
    setOpen(true);
  } else if (key === null && seen !== null) {
    setSeen(null);
  }

  useEffect(() => {
    if (key === null || !path) return;
    window.history.replaceState(null, "", path);
  }, [key, path]);

  if (!result || !open) return null;

  const Icon = NOTICE_ICON[result.tone];
  const close = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <ModalShell label={result.title} size="sm" onClose={close}>
      {/* role 은 **본문 안쪽**에 건다 — ModalShell 이 이미 role="dialog" 다 */}
      <div role={result.tone === "negative" ? "alert" : "status"} className="flex flex-col items-center gap-3 py-2 text-center">
        <Icon className={cn("size-10", NOTICE_ICON_COLOR[result.tone])} aria-hidden />
        <div className="space-y-1">
          <p className="break-keep text-[17px] font-semibold leading-snug">{result.title}</p>
          {result.description ? <p className="break-keep text-[15px] leading-relaxed text-fg-sub">{result.description}</p> : null}
        </div>
        {result.detail ? (
          <p className="w-full break-all rounded-card bg-plate p-3 text-left font-mono text-[12px] leading-relaxed text-fg-sub">{result.detail}</p>
        ) : null}
        <Button type="button" variant="primary" size="md" className="mt-1 w-full" onClick={close}>
          확인
        </Button>
      </div>
    </ModalShell>
  );
}
