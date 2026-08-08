/*
 * 문의 유형 상수 — actions.ts(파일 상단 "use server")에서 분리.
 * "use server" 모듈은 async 함수만 export할 수 있어서, 클라이언트 컴포넌트가
 * 거기서 배열 상수를 import하면 실제 배열 대신 서버 참조로 바뀌어
 * INQUIRY_TYPES.map이 런타임에 깨진다(데모 모드 프리렌더에서 실측 확인).
 */
export const INQUIRY_TYPES = ["결제", "계정", "기능", "기타"] as const;
export type InquiryType = (typeof INQUIRY_TYPES)[number];
