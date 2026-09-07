/*
  플랜별 팀 좌석 수 — 요금제 표가 파는 값의 **정본**.

  왜 이 파일이 생겼나(2026-09-07 감사): 요금제 비교표와 플랜 카드가 「팀 기능 — Pro 최대 3인 /
  Agency 최대 10인 + 권한 관리 / Enterprise 무제한」을 차별점으로 팔고 있었는데, 초대 액션에는
  plan 이라는 단어조차 없었다. 즉 Free 사용자도 팀을 무제한으로 쓰고, Pro 를 산 사람은 표에 적힌 것보다
  더 쓸 수 있었다. **판 것과 준 것이 다르면 그게 곧 클레임이다.**

  숫자를 바꿀 때는 lib/mock/data.ts 의 planFeatures «팀 기능» 행과 components/pricing/plan-cards.tsx 의
  perks 문구를 반드시 함께 바꾼다 — 세 곳이 갈리면 다시 같은 문제가 된다.

  의존이 없다 — 마케팅 페이지(클라이언트)와 서버 액션이 함께 읽는다.
*/

/** 활성 팀원 수 상한(소유자 제외). Infinity = 무제한 */
export const TEAM_SEATS: Record<string, number> = {
  free: 0,
  creator: 0,
  pro: 3,
  agency: 10,
  enterprise: Number.POSITIVE_INFINITY,
};

/**
 * 이 플랜이 쓸 수 있는 좌석 수.
 * ⚠️ plan 이 null(조회 실패)이면 **막지 않는다** — 유료 고객을 무료 상한으로 잠그는 쪽이 더 나쁘다.
 * 그 경우 Infinity 를 돌려주고, 실제 상한은 다음 정상 조회에서 다시 걸린다.
 */
export function teamSeatsFor(plan: string | null): number {
  if (plan === null) return Number.POSITIVE_INFINITY;
  return TEAM_SEATS[plan] ?? 0;
}
