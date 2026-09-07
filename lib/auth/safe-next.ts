/*
  로그인 후 돌아갈 주소(`next`) 검증 — **한 곳에서만** 판정한다.

  왜 문자열 접두 검사를 버렸나(2026-09-07 감사): 예전 규칙은 «/ 로 시작 + // 아님 + \ 없음» 이었는데,
  URL 파서가 **탭·개행·기타 제어문자를 조용히 지운다.** 그래서 `/\t/evil.com` 은 세 검사를 전부 통과하고,
  `new URL("/\t/evil.com", "https://finch.ai.kr")` 은 `https://evil.com/` 이 된다(실측 확인).
  로그인이 **성공한 뒤**에 튕겨 나가므로 피해자가 가장 알아차리기 어려운 자리다 — 방금 진짜 도메인을 봤기 때문이다.

  이제는 파서에 먼저 통과시키고 **결과의 오리진**을 본다. 파서가 무엇을 지우든 최종 결과로 판정하므로
  같은 우회가 다시 통하지 않는다.

  의존이 없다 — 서버 라우트(app/auth/callback)와 클라이언트 폼(login-form) 둘 다 이 파일을 쓴다.
  검증이 두 벌이면 한쪽만 고쳐 다시 벌어진다(실제로 그렇게 벌어져 있었다).
*/

/** 로그인 목적지 기본값 */
export const DEFAULT_NEXT = "/dashboard";

/**
 * 안전한 내부 경로만 돌려준다. 외부 주소·API 라우트·이상한 값은 전부 기본값으로.
 * @param raw    쿼리에서 읽은 next 값
 * @param origin 판정 기준 오리진. 서버는 요청 오리진, 브라우저는 location.origin.
 */
export function safeNext(raw: string | null | undefined, origin: string): string {
  if (!raw) return DEFAULT_NEXT;
  let dest: URL;
  try {
    dest = new URL(raw, origin);
  } catch {
    return DEFAULT_NEXT;
  }
  /* 파서가 제어문자를 지운 «최종» 오리진으로 판정한다 — //evil.com, /\evil.com, /\t/evil.com 전부 여기서 걸린다 */
  if (dest.origin !== origin) return DEFAULT_NEXT;
  /* /api 는 목적지로 받지 않는다 — 로그인이 화면 없이 API 라우트로 직행하면 동의 게이트(페이지 렌더)가
     한 번도 안 걸린 채 연동·수집이 시작될 수 있다(/login?next=/api/auth/instagram/start 트릭, 2026-09-02 감사). */
  if (dest.pathname === "/api" || dest.pathname.startsWith("/api/")) return DEFAULT_NEXT;
  return `${dest.pathname}${dest.search}${dest.hash}`;
}
