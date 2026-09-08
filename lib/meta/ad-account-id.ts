/*
  광고 계정 id 의 형식 판정과 Graph 경로 조립 — **이 파일이 유일한 입구다.**

  왜 생겼나 (2026-09-08 보안 감사, High):
  `meta_ad_accounts.ad_account_id` 는 0077 이후 열 단위 GRANT 도 형식 제약도 없어서
  로그인 사용자가 PostgREST 로 **임의 문자열**로 바꿀 수 있었다. 그런데 그 값이
  `${GRAPH_FB_BASE}/act_${adAccountId}/campaigns` 처럼 **인코딩 없이** URL 경로에 조립됐다.
  WHATWG URL 파서는 `..` 를 해석하므로, id 에 `1/../../me/accounts?fields=…&x=` 를 넣으면
  최종 요청이 `https://graph.facebook.com/me/accounts?…` 가 된다.

  그 호출에 실리는 토큰은 **워크스페이스 소유자의 것**이다(lib/data/ads.ts 가 ownerId 로 토큰을 찾는다).
  즉 활성 팀원 한 명이 소유자의 ads_management 토큰으로 임의 Graph 노드를 읽고,
  editor 면 쓸 수도 있었다 — 소유자가 핀치에 연결한 적 없는 광고 계정에 캠페인을 만드는 것까지.
  더 단순한 변형도 성립했다: 탈출 문자 없이 **다른 광고 계정의 숫자 id** 로 바꾸기만 해도 옆걸음이 된다.

  방어는 세 겹이고 이 파일은 그중 첫 겹이다:
   ① 여기 — 숫자만 통과시키고, 아니면 던진다(조용히 다른 노드를 부르지 않는다)
   ② lib/data/ads.ts — 형식 위반 행은 애초에 «고를 수 있는 계정» 목록에서 뺀다
   ③ 마이그레이션 0088 — DB check + 복합 FK + 열 단위 GRANT

  의존이 없다 — 서버 라이브러리 6곳이 함께 읽는다.
*/

/**
 * Meta 광고 계정 id 형식. **숫자만.**
 * 저장은 `act_` 접두를 빼고 숫자만 한다(0077 주석) — 접두 유무가 섞이면 조회가 조용히 404 로 떨어진다.
 * 현행 계정 id 는 15~17자리다. 상한 32는 넉넉히 잡은 값이고, 더 긴 계정이 실존하면 여기만 올린다.
 */
export const AD_ACCOUNT_ID_RE = /^[0-9]{1,32}$/;

export function isValidAdAccountId(v: string | null | undefined): boolean {
  return typeof v === "string" && AD_ACCOUNT_ID_RE.test(v);
}

/**
 * Graph 경로의 `/act_<id>` 조각을 만든다. **`/act_${id}` 를 손으로 쓰지 말고 항상 이걸 쓴다.**
 *
 * 형식이 아니면 **던진다.** 조용히 빈 문자열이나 다른 경로를 돌려주면, 우리 토큰이
 * 엉뚱한 Graph 노드로 가는 일이 로그 없이 일어난다 — 그게 이 결함의 본질이었다.
 * 읽기 경로는 이미 try/catch 안이라 «조회 실패» 로 떨어지고, 쓰기 경로는 예약 단계에서 멈춘다.
 */
export function actPath(adAccountId: string): string {
  if (!isValidAdAccountId(adAccountId)) throw new Error("invalid_ad_account_id");
  return `/act_${adAccountId}`;
}
