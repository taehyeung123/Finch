/**
 * AI 로 보내기 전에 댓글 속 제3자 식별 정보를 가린다 — **순수 모듈**(scripts/test-legal.ts 가 직접 부른다).
 *
 * 개인정보처리방침 제3조④·제8조(Anthropic 행)가 «댓글 내용(작성자 정보 제외, @사용자명은 가림)»을 약속한다(2026-09-12).
 * 분위기(긍정·중립·부정) 분류에는 누가 누구를 불렀는지가 필요 없다.
 *
 * 순서가 중요하다(2026-09-12 점검): 예전엔 «@아이디» 하나만 가려서 `hong.gildong@naver.com` 이 `hong.gildong@사용자` 가 됐다 —
 * 사람을 가리키는 앞부분이 그대로 갔다. 그래서
 *  ① «글자@글자» 덩어리(이메일, 최상위 도메인이 없는 것까지)를 통째로 «[이메일]»로 먼저 바꾸고
 *  ② 남은 «@아이디»(앞이 공백·한글·문장부호)를 «@사용자»로 바꾼다.
 * 인스타그램 아이디는 영문·숫자·마침표·밑줄 30자까지다.
 */

const EMAIL_LIKE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9._-]+/g;
const MENTION = /@[A-Za-z0-9._]{1,30}/g;

export function maskCommentForAi(text: string): string {
  return text.replace(EMAIL_LIKE, "[이메일]").replace(MENTION, "@사용자");
}
