/**
 * 발행 표·함수(0093)가 올리는 오류 → 한국어 문구. 발행 액션·스튜디오 예약 라우트가 같은 표를 쓴다.
 * DB 는 기계용 키(too_many_unpublished …)를 message 에, 사람용 설명을 hint 에 싣는다 — 화면 문구는 여기서만 만든다.
 * 이 파일은 import 가 없다.
 */

const TEXT: Record<string, string> = {
  too_many_unpublished: "저장해 둔 초안과 예약이 너무 많아요(최대 60개). 발행했거나 필요 없는 것을 지운 뒤 다시 시도해 주세요.",
  schedule_in_past: "지난 시각으로는 예약할 수 없어요.",
  post_status_denied: "지금은 이 글을 바꿀 수 없는 상태예요. 목록을 새로고침해 주세요.",
  post_delete_denied: "초안·실패·취소된 글만 지울 수 있어요.",
  post_frozen: "이미 발행 준비를 시작한 글은 고칠 수 없어요.",
  upload_not_ready: "올린 파일을 확인하지 못했어요 — 사진·영상을 다시 올려 주세요.",
  too_many_pending: "지금 올리는 파일이 너무 많아요 — 올리던 것이 끝난 뒤 다시 시도해 주세요.",
  too_many_daily: "하루에 올릴 수 있는 파일 수를 넘었어요 — 내일 다시 올려 주세요.",
  storage_full: "보관 중인 사진·영상이 너무 많아요 — 필요 없는 초안을 지운 뒤 다시 올려 주세요.",
  service_full: "지금은 파일을 올릴 수 없어요 — 잠시 후 다시 시도해 주세요.",
};

/** 알려진 키면 그 키, 아니면 null */
export function publishDbErrorKey(error: { message?: string | null } | null | undefined): string | null {
  const msg = error?.message ?? "";
  for (const key of Object.keys(TEXT)) if (msg.includes(key)) return key;
  return null;
}

/** 알려진 키면 한국어 문구, 아니면 null(호출측이 일반 문구를 쓴다) */
export function publishDbErrorText(error: { message?: string | null } | null | undefined): string | null {
  const key = publishDbErrorKey(error);
  return key ? TEXT[key] : null;
}
