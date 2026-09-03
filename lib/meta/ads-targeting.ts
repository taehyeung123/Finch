import { fbGetResult, type AdAccountUsage, type AdsWriteError } from "./ads-write";
import type { AdSetTargetingJson } from "@/lib/ads/adset-rules";

/**
 * 타겟팅 조회 어댑터 — 2단계 슬라이스 4. 전부 **GET** 이고 아무것도 만들지 않는다.
 *  · adgeolocation(시·도, KR) · adinterest(ko_KR) · targetingvalidation · reachestimate
 *
 * ⚠️ 결과를 DB 에 넣지 않는다(스펙 §6.2) — 관심사 체계·지역 key 는 메타가 바꾼다. 세션 캐시는 클라이언트가 든다.
 * ⚠️ 실패는 «없음»이 아니다 — 빈 배열([])은 «일치하는 것이 없다»이고, {ok:false} 는 «확인 못 함»이다.
 *    화면은 둘을 다른 문구로 말한다(search_unverified vs «일치하는 … 없어요»).
 * ⚠️ 문서에서 확인 못 한 것(§11-15·16): adgeolocation 에 locale=ko_KR 이 먹는지, targetingvalidation 응답 필드.
 *    파서는 필드가 없어도 깨지지 않게 썼다 — 없으면 null 이지 0 이 아니다.
 */

export type TargetingRead<T> = { ok: true; data: T; usage: AdAccountUsage | null } | { ok: false; error: AdsWriteError };

export interface FbGeoRegion {
  /** adgeolocation 이 준 key — 광고 세트 geo_locations.regions[].key 로 그대로 나간다 */
  key: string;
  name: string;
  countryCode: string | null;
}

export interface FbInterestHit {
  id: string;
  name: string;
  /** 관심사 체계 경로(«쇼핑 및 패션 › 뷰티») — 같은 이름이 여러 갈래에 있을 때 구분용 */
  path: string | null;
  /** 메타가 준 잠재 도달 상·하한 — 둘 다 있을 때만 «약 N~M명». 없으면 null(0 이 아니다) */
  audienceLower: number | null;
  audienceUpper: number | null;
}

const REGION_LIMIT = "10";
const INTEREST_LIMIT = "15";
const PATH_MAX = 60;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function idLike(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
function nonNegInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** 시·도 검색 — `type=adgeolocation&location_types=["region"]&country_code=KR` */
export async function searchAdRegions(q: string, accessToken: string): Promise<TargetingRead<FbGeoRegion[]>> {
  const res = await fbGetResult<{ data?: unknown[] }>(
    "/search",
    {
      type: "adgeolocation",
      q,
      location_types: JSON.stringify(["region"]),
      country_code: "KR",
      locale: "ko_KR",
      limit: REGION_LIMIT,
    },
    accessToken,
  );
  if (!res.ok) return res;
  const out: FbGeoRegion[] = [];
  for (const row of Array.isArray(res.data.data) ? res.data.data : []) {
    const o = row as Record<string, unknown>;
    const key = idLike(o.key);
    const name = str(o.name);
    if (!key || !name) continue;
    /* 요청에 region 만 달랬지만, 다른 단위가 섞여 오면 버린다 — 광고 세트에는 regions 로만 나간다 */
    if (o.type !== undefined && o.type !== "region") continue;
    const cc = str(o.country_code);
    if (cc && cc.toUpperCase() !== "KR") continue;
    out.push({ key, name, countryCode: cc });
  }
  return { ok: true, data: out, usage: res.usage };
}

/** 관심사 검색 — `type=adinterest&locale=ko_KR`. audience_size_*_bound 는 있으면 담고 없으면 null */
export async function searchAdInterests(q: string, accessToken: string): Promise<TargetingRead<FbInterestHit[]>> {
  const res = await fbGetResult<{ data?: unknown[] }>(
    "/search",
    { type: "adinterest", q, locale: "ko_KR", limit: INTEREST_LIMIT },
    accessToken,
  );
  if (!res.ok) return res;
  const out: FbInterestHit[] = [];
  for (const row of Array.isArray(res.data.data) ? res.data.data : []) {
    const o = row as Record<string, unknown>;
    const id = idLike(o.id);
    const name = str(o.name);
    if (!id || !name || !/^\d{1,30}$/.test(id)) continue;
    let path: string | null = null;
    if (Array.isArray(o.path)) {
      const parts = (o.path as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0);
      /* 마지막 요소는 보통 이름 자체다 — 빼고 보여 준다 */
      const trimmed = parts.length > 0 && parts[parts.length - 1] === name ? parts.slice(0, -1) : parts;
      const joined = trimmed.join(" › ");
      path = joined.length === 0 ? null : joined.length > PATH_MAX ? `${joined.slice(0, PATH_MAX - 1)}…` : joined;
    }
    const lower = nonNegInt(o.audience_size_lower_bound);
    const upper = nonNegInt(o.audience_size_upper_bound);
    out.push({
      id,
      name,
      path,
      audienceLower: lower !== null && upper !== null ? lower : null,
      audienceUpper: lower !== null && upper !== null ? upper : null,
    });
  }
  return { ok: true, data: out, usage: res.usage };
}

export interface TargetingValidation {
  /** 메타가 «유효»라고 답한 것 — 이름은 **메타 응답의 것**(클라이언트가 보낸 이름을 쓰지 않는다) */
  valid: { id: string; name: string }[];
  /** 메타가 «유효하지 않음»이라고 답한 id */
  invalid: string[];
  /** 응답에 아예 없던 id — 확인 못 한 것이지 «무효»는 아니다. 호출측이 보수적으로 다룬다 */
  unknown: string[];
}

/**
 * 관심사 id 재검증 — `GET /act_{id}/targetingvalidation?targeting_list=[{type:"interests",id}]`.
 * 생성 직전에 클라이언트가 보낸 id 를 메타에 다시 물어본다(제출값을 믿지 않는다 — §7.3).
 */
export async function validateInterestIds(
  adAccountId: string,
  ids: readonly string[],
  accessToken: string,
): Promise<TargetingRead<TargetingValidation>> {
  if (ids.length === 0) return { ok: true, data: { valid: [], invalid: [], unknown: [] }, usage: null };
  const res = await fbGetResult<{ data?: unknown[] }>(
    `/act_${adAccountId}/targetingvalidation`,
    { targeting_list: JSON.stringify(ids.map((id) => ({ type: "interests", id }))) },
    accessToken,
  );
  if (!res.ok) return res;
  const seen = new Set<string>();
  const valid: { id: string; name: string }[] = [];
  const invalid: string[] = [];
  for (const row of Array.isArray(res.data.data) ? res.data.data : []) {
    const o = row as Record<string, unknown>;
    const id = idLike(o.id);
    if (!id || !ids.includes(id)) continue;
    seen.add(id);
    const name = str(o.name);
    if (o.valid === true && name) valid.push({ id, name });
    else invalid.push(id);
  }
  const unknown = ids.filter((id) => !seen.has(id));
  return { ok: true, data: { valid, invalid, unknown }, usage: res.usage };
}

export interface ReachEstimate {
  /** false 면 아직 추정이 안 나온 것 — 숫자를 쓰지 않는다 */
  ready: boolean;
  lower: number | null;
  upper: number | null;
}

/**
 * 예상 도달 — `GET /act_{id}/reachestimate?targeting_spec=…`. 응답 data 는 객체(옛 버전은 배열) 둘 다 받는다.
 * 옛 필드 `users` 만 오면 상·하한을 같은 값으로 둔다.
 */
export async function estimateReach(
  adAccountId: string,
  targeting: AdSetTargetingJson,
  accessToken: string,
): Promise<TargetingRead<ReachEstimate>> {
  const res = await fbGetResult<{ data?: unknown }>(
    `/act_${adAccountId}/reachestimate`,
    { targeting_spec: JSON.stringify(targeting) },
    accessToken,
  );
  if (!res.ok) return res;
  const raw = Array.isArray(res.data.data) ? res.data.data[0] : res.data.data;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let lower = nonNegInt(o.users_lower_bound);
  let upper = nonNegInt(o.users_upper_bound);
  if (lower === null && upper === null) {
    const users = nonNegInt(o.users);
    if (users !== null) {
      lower = users;
      upper = users;
    }
  }
  /* estimate_ready 가 없으면(필드 누락) 숫자가 있을 때만 ready 로 본다 */
  const ready = typeof o.estimate_ready === "boolean" ? o.estimate_ready : lower !== null && upper !== null;
  return { ok: true, data: { ready, lower, upper }, usage: res.usage };
}
