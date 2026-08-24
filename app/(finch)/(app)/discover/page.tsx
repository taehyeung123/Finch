import { redirect } from "next/navigation";

/**
 * 구 "트렌드 탐색" — /library(레퍼런스 수집함)로 흡수됨 (PRD PART 4.4).
 * "실시간 급상승"의 실체는 게시 시각 오름차순 정렬이었고, /library 정렬 옵션
 * "게시 최신순"이 이를 대체한다. 북마크·기존 세션 링크를 위해 라우트는 남긴다.
 */
export default function Page() {
  redirect("/library");
}
