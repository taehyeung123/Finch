import type { ReferenceAd, ReferenceItem } from "@/lib/types";

/* 스크랩 항목. 광고와 게시물은 풀에서 같은 creatives 행이지만 카드가 달라
   화면 경계에서 갈라 둔다.

   타입만 담은 파일인 이유: actions.ts 는 "use server" 라 **async 함수 외에는
   아무것도 export 할 수 없다**(상수도 안 된다). 클라이언트 파일에 두면 서버가
   클라이언트를 import 하게 되므로, 양쪽이 함께 보는 자리를 따로 둔다. */
export type ScrapEntry =
  | { kind: "post"; item: ReferenceItem }
  | { kind: "ad"; ad: ReferenceAd };

/** 한 번에 받는 저장 건수 — 첫 장(서버 컴포넌트)과 더 보기가 같은 값을 써야 한다 */
export const SCRAP_PAGE_SIZE = 60;
