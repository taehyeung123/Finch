/**
 * 광고성 DM 컴플라이언스 문구 삽입 — 정보통신망법 제50조.
 * 광고성 정보는 (1) 맨 앞에 (광고) 표기, (2) 무료 수신거부 방법이 모두 있어야 한다.
 * 클라이언트 미리보기(rule-editor)와 서버 액션(actions)이 같은 결과를 내도록 단일 소스로 둔다.
 */

/** 수신거부 안내 한 줄 */
export const AD_OPT_OUT_LINE = "수신거부는 이 메시지에 '수신거부'라고 답장해 주세요.";

/**
 * 광고성이면 (광고) 표기를 맨 앞에 정규화하고, 수신거부 안내가 없으면 맨 끝에 붙인다.
 * - 라벨은 문자열 존재 여부가 아니라 "맨 앞"을 보장한다 (사용자가 이미 앞에 넣었으면 중복 삽입하지 않음).
 * - 수신거부는 라벨과 별개로 항상 보장한다 (라벨만 있고 수신거부가 없는 경우 방지).
 */
export function applyAdDisclosure(message: string, isAdvertising: boolean): string {
  if (!isAdvertising) return message;
  const body = message.replace(/^\s*\(광고\)\s*/, "");
  let out = `(광고) ${body}`;
  if (!out.includes("수신거부")) {
    out = `${out}\n\n${AD_OPT_OUT_LINE}`;
  }
  return out;
}
