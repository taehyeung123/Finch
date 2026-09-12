import { GaOff } from "@/components/analytics/google-analytics";

/*
  팀 초대 수락 화면의 틀 — 하는 일은 하나: 공개 화면에서 떠 온 Google Analytics 를 끈다.
  이 화면 주소에는 초대 토큰(?token=…)이 실린다. 토큰이 이용 통계로 새 나가면 안 된다(개인정보처리방침 제14·15조).
*/
export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GaOff />
      {children}
    </>
  );
}
