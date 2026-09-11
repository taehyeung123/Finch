import type { FbBusiness } from "@/lib/meta/ads";

/*
  비즈니스 포트폴리오 — 광고 계정이 어느 메타 비즈니스 포트폴리오 소속인지(2026-09-11).
  조회는 lib/data/ads.ts getOwnAdPortfolios, 화면 문장은 settings/channels/_lib/derive-state.ts derivePortfolioRow.
  여기는 **판정만** 한다(순수 함수·타입) — 서버 의존이 없어 스크립트로 바로 검증할 수 있다.
*/

/** 광고 계정 하나의 소속 — **모름(unknown)과 없음(none)을 가른다**(lib/data/ads.ts 머리 규약 «실패는 없음이 아니다») */
export type AccountBusiness =
  /** 이 포트폴리오가 소유한 광고 계정 */
  | { state: "owned"; id: string; name: string | null }
  /** 조회가 통했고 소유 포트폴리오가 없다 — 개인 광고 계정 */
  | { state: "none" }
  /** 확인 못 함 */
  | { state: "unknown" };

export interface AdAccountPortfolio {
  adAccountId: string;
  accountName: string | null;
  isDefault: boolean;
  business: AccountBusiness;
}

export type AdPortfolioState =
  /** 보여 줄 게 없다 — 연동 없음·만료·계정 0개·아직 안 열림. 그 사실은 바로 위 «Meta 광고» 줄이 이미 말한다 */
  | { state: "unavailable" }
  /** business_management 를 **확실히** 못 받았다(0075 규칙 — 모르면 여기로 오지 않는다) — 다시 연결하면 보인다 */
  | { state: "scope_missing" }
  /** 조회 실패 — «확인 못 함». «포트폴리오 없음»으로 그리지 않는다 */
  | { state: "error" }
  | { state: "ok"; accounts: AdAccountPortfolio[] };

/**
 * 광고 계정 하나의 소속을 두 조회 결과로 정한다(순수 함수).
 *  · owners — /me/adaccounts?fields=business (null = 실패, Map 에 없는 계정 = 모름)
 *  · businesses — /me/businesses (null = 실패)
 * ⚠️ «개인 광고 계정(none)»이라고 말하려면 **이 토큰의 business_management 가 실제로 통한다는 증거**가 있어야 한다 —
 *    /me/businesses 성공이 그 증거다. 그 호출이 실패했으면 business 필드가 권한 때문에 빠진 것인지 알 수 없어 unknown 이다.
 *    소속이 **있다**는 답은 증거 없이도 믿는다(필드가 왔다는 것 자체가 사실이다).
 */
export function resolveAccountBusiness(
  accountId: string,
  owners: Map<string, FbBusiness | null> | null,
  businesses: FbBusiness[] | null,
): AccountBusiness {
  if (owners === null || !owners.has(accountId)) return { state: "unknown" };
  const owner = owners.get(accountId) ?? null;
  if (owner) {
    /* 필드에 이름이 없으면(내가 속하지 않은 포트폴리오일 때 등) 내 포트폴리오 목록에서 이름을 찾는다 */
    const name = owner.name ?? businesses?.find((b) => b.id === owner.id)?.name ?? null;
    return { state: "owned", id: owner.id, name };
  }
  return businesses !== null ? { state: "none" } : { state: "unknown" };
}
