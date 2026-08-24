"use client";

import { useEffect } from "react";

/*
  편집기·미리보기용 글꼴 스타일시트 주입 — **비차단**.
  React 19 의 <link rel="stylesheet" precedence> 는 로드가 끝날 때까지 가장 가까운 Suspense 를
  서스펜드한다. 테마 패널이 글꼴 15종 CSS 를 한꺼번에 싣자 편집 화면 전체가 로딩 베일로 빠졌다.
  여기서는 document.head 에 <link> 를 직접 붙여 렌더를 막지 않는다(이미 있으면 건너뛴다).
  공개 페이지(/p/[slug])는 서버 렌더라 precedence 링크를 그대로 쓴다.
*/
export function useFontStylesheets(hrefs: string[]) {
  const key = hrefs.join("|");
  useEffect(() => {
    if (!key) return;
    for (const href of key.split("|")) {
      if (document.querySelector(`link[data-lp-font="${href}"]`)) continue;
      const el = document.createElement("link");
      el.rel = "stylesheet";
      el.href = href;
      el.dataset.lpFont = href;
      document.head.appendChild(el);
    }
    /* 떼지 않는다 — 같은 세션에서 글꼴을 오가며 비교하는 동안 매번 다시 받지 않게 */
  }, [key]);
}
