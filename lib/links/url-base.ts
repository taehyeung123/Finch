/*
  쿠키 Path 에 넣어도 안전한 «페이지 주소 조각» 판정 — 프록시와 서버 액션이 함께 쓴다.

  왜 생겼나 (2026-09-08 보안 감사): 방문자 쿠키와 잠금 해제 쿠키의 `path` 에
  **검증 없는 문자열**이 그대로 들어갔다. Next 의 Set-Cookie 직렬화는 값만 인코딩하고
  **Path 는 그대로 이어 붙인다**(@edge-runtime/cookies stringifyCookie).
  세미콜론은 헤더에서 정상 문자라 그대로 속성 구분자로 읽힌다:

    https://finch.ai.kr/abc;Path=/
      → Set-Cookie: finch_lv=…; Path=/abc;Path=/; Max-Age=…; HttpOnly; …
      → 뒤의 Path=/ 가 이겨 **방문자 토큰이 오리진 전체에 걸린다**(경로를 좁혀 둔 의도가 무너진다)
    https://finch.ai.kr/abc;Domain=finch.ai.kr
      → host-only 쿠키가 도메인 쿠키가 돼 서브도메인까지 실려 나간다

  프록시 쪽은 **인증이 필요 없다** — 링크 하나를 열게 하면 그만이라 이쪽이 실제 노출이다.
  (개행을 넣는 응답 분리는 런타임 Headers 검증이 이미 막는다. 여기서 막는 것은 속성 주입이다.)

  ⚠️ 정규식을 **좁히지 말 것.** 여기서 탈락하면 그 페이지 방문자에게 finch_lv 가 안 생기고,
  그러면 30분 중복 방문 병합이 안 걸려 조회수가 부풀고 체류시간이 통째로 사라진다.
  DB 제약보다 넓게 잡아 둔 이유가 그것이다(slug 0045: 2~30자, sub_slug 0060: 1~40자).

  의존이 없다 — proxy.ts(Node 런타임)와 서버 액션이 함께 읽는다.
*/

/** slug 또는 slug/sub. 세미콜론·공백·개행·대문자는 전부 탈락한다. */
export const URL_BASE_RE = /^[a-z0-9][a-z0-9-]{0,39}(?:\/[a-z0-9][a-z0-9-]{0,39})?$/;

/** 쿠키 Path·리다이렉트에 써도 되는 값이면 그대로, 아니면 null */
export function safeUrlBase(base: string | null | undefined): string | null {
  return typeof base === "string" && URL_BASE_RE.test(base) ? base : null;
}
