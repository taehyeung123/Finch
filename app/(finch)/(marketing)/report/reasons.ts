/* 신고 사유 — 서버 액션("use server" 모듈은 async 함수만 export 가능)과
   클라이언트 폼이 같은 목록을 쓰도록 여기 한 곳에 둔다. 0071 의 check 제약과 값이 같아야 한다. */
export const REPORT_REASONS = ["사칭", "사기·피싱", "불법·유해", "저작권 침해", "스팸", "기타"] as const;
