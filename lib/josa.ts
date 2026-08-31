/**
 * 한글 조사 — 앞 글자의 받침에 따라 갈리는 조사를 붙인다.
 *
 * 왜 필요한가: 채널·플랜처럼 **이름이 변수인 문구**가 늘면서
 * 「스레드은」·「인스타그램가」 같은 문장이 화면에 나갔다(2026-08-31 실측).
 * 한 글자만 어긋나도 «급하게 만든 티»가 나는 종류의 흠이라, 문구를 조립하는 자리에서 쓴다.
 *
 * 규칙: 마지막 글자가 한글이면 받침 유무로 고르고,
 * 한글이 아니면(영문·숫자로 끝나는 이름) **받침 없는 쪽**을 쓴다 —
 * 「Threads는」·「Pro는」이 「Threads은」보다 자연스럽다.
 */

/** 마지막 글자에 받침이 있는가. 한글이 아니면 false. */
export function hasJongseong(word: string): boolean {
  const last = word.trim().slice(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  // 한글 음절 영역 가~힣
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 은/는 */
export function eunNeun(word: string): string {
  return `${word}${hasJongseong(word) ? "은" : "는"}`;
}

/** 을/를 */
export function eulReul(word: string): string {
  return `${word}${hasJongseong(word) ? "을" : "를"}`;
}

/** 이/가 */
export function iGa(word: string): string {
  return `${word}${hasJongseong(word) ? "이" : "가"}`;
}
