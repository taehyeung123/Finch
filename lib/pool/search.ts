import "server-only";

import { createClient } from "@/lib/supabase/server";
import { thumbPublicUrl } from "@/lib/pool/thumbs";

/*
  풀 검색 — 사용자가 실제로 두드리는 읽기 경로.

  **여기서는 공급사를 호출하지 않는다.** 그게 이번 구조 변경의 전부다.
  예전에는 "검색 = 수집"이라 사람이 검색할 때마다 크레딧이 나갔고, 100명이 같은 말을
  찾으면 같은 데이터를 100번 샀다. 지금은 검색이 DB 조회이므로 원가가 0이고,
  수집은 크론이 전원 몫으로 한 번만 한다.

  풀에 없는 검색어는 결과 0건으로 정직하게 돌려주고 search_history 에 기록한다.
  그 기록이 플래너의 최우선 수집 대상이 된다 — 없다고 그 자리에서 사오지 않는다
  (그러면 예전 구조로 되돌아간다).

  RLS: 여기서는 사용자 세션 클라이언트를 쓴다. admin 클라이언트를 쓰면
  takedown_at 이 찬 소재나 blocked 브랜드가 새어 나간다 — 그 필터는 정책에 있다.
*/

export type PoolSort = "heat" | "recent" | "longest" | "saved";
export type PoolPlatformFilter = "all" | "meta_ads" | "instagram" | "tiktok" | "threads";

export interface PoolQuery {
  q?: string;
  industryId?: string | null;
  platform?: PoolPlatformFilter;
  mediaFormat?: "all" | "video" | "photo" | "carousel";
  /** 광고 전용 — 최소 집행일. "오래 돌아간 = 검증된" 을 사용자가 직접 조일 수 있게 */
  minRunDays?: number;
  sort?: PoolSort;
  page?: number;
  pageSize?: number;
}

export interface PoolItem {
  id: string;
  kind: "ad" | "post";
  platform: string;
  title: string;
  body: string;
  permalink: string | null;
  thumbUrl: string | null;
  mediaFormat: string;
  brandName: string | null;
  brandId: string | null;
  views: number;
  likes: number;
  comments: number;
  followerCount: number;
  isActive: boolean | null;
  runDays: number | null;
  industryIds: string[];
  heatScore: number;
  saveCount: number;
  postedAt: string | null;
}

export interface PoolResult {
  items: PoolItem[];
  total: number;
  hasMore: boolean;
  /** 풀이 이 검색어를 아직 모른다 — 화면이 "수집 예약됨" 안내를 띄우는 신호 */
  isGap: boolean;
}

const DEFAULT_PAGE_SIZE = 40; // 5열 그리드 × 8줄

interface Row {
  id: string;
  kind: string;
  platform: string;
  title: string;
  body: string;
  permalink: string | null;
  thumb_path: string | null;
  media_format: string;
  brand_id: string | null;
  views: number;
  likes: number;
  comments: number;
  follower_count: number;
  is_active: boolean | null;
  run_days: number | null;
  industry_ids: string[] | null;
  heat_score: number;
  posted_at: string | null;
  brands: { id: string; name: string } | { id: string; name: string }[] | null;
  creative_stats: { save_count: number } | { save_count: number }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  if (v === null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function toItem(r: Row): PoolItem {
  const brand = one(r.brands);
  const stats = one(r.creative_stats);
  return {
    id: r.id,
    kind: r.kind === "ad" ? "ad" : "post",
    platform: r.platform,
    title: r.title,
    body: r.body,
    permalink: r.permalink,
    thumbUrl: thumbPublicUrl(r.thumb_path),
    mediaFormat: r.media_format,
    brandName: brand?.name ?? null,
    brandId: brand?.id ?? null,
    views: r.views ?? 0,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    followerCount: r.follower_count ?? 0,
    isActive: r.is_active,
    runDays: r.run_days,
    industryIds: Array.isArray(r.industry_ids) ? r.industry_ids : [],
    heatScore: r.heat_score ?? 0,
    saveCount: stats?.save_count ?? 0,
    postedAt: r.posted_at,
  };
}

const SELECT =
  "id, kind, platform, title, body, permalink, thumb_path, media_format, brand_id, " +
  "views, likes, comments, follower_count, is_active, run_days, industry_ids, heat_score, posted_at, " +
  "brands(id, name), creative_stats(save_count)";

export async function searchPool(query: PoolQuery): Promise<PoolResult> {
  const supabase = await createClient();
  if (!supabase) return { items: [], total: 0, hasMore: false, isGap: false };

  const page = Math.max(0, query.page ?? 0);
  const size = Math.min(60, Math.max(10, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const from = page * size;

  let sel = supabase.from("creatives").select(SELECT, { count: "estimated" });

  if (query.platform && query.platform !== "all") sel = sel.eq("platform", query.platform);
  if (query.mediaFormat && query.mediaFormat !== "all") sel = sel.eq("media_format", query.mediaFormat);
  if (query.industryId) sel = sel.contains("industry_ids", [query.industryId]);
  if (query.minRunDays && query.minRunDays > 0) sel = sel.gte("run_days", query.minRunDays);

  const q = (query.q ?? "").trim();
  if (q.length > 0) {
    // body 의 trigram GIN 인덱스를 타는 경로. 제목·본문·매칭 키워드 어디에 걸려도 잡는다.
    const safe = q.replace(/[%,()]/g, " ").trim();
    if (safe) sel = sel.or(`body.ilike.%${safe}%,title.ilike.%${safe}%`);
  }

  switch (query.sort ?? "heat") {
    case "recent":
      sel = sel.order("posted_at", { ascending: false, nullsFirst: false });
      break;
    case "longest":
      // "가장 오래 돌아간 광고" — 이 서비스가 파는 정보의 핵심 정렬
      sel = sel.order("run_days", { ascending: false, nullsFirst: false });
      break;
    case "saved":
      sel = sel.order("heat_score", { ascending: false });
      break;
    default:
      sel = sel.order("heat_score", { ascending: false });
  }
  // 동점 tie-break. 없으면 페이지를 넘길 때 같은 항목이 다시 나오거나 건너뛴다.
  sel = sel.order("id", { ascending: false });

  const { data, count, error } = await sel.range(from, from + size - 1);
  if (error) {
    console.error("[pool] 검색 실패", error.message);
    return { items: [], total: 0, hasMore: false, isGap: false };
  }

  const rows = (data ?? []) as unknown as Row[];
  const items = rows.map(toItem);
  const total = count ?? items.length;

  return {
    items,
    total,
    hasMore: from + items.length < total,
    // 첫 페이지가 비었을 때만 "구멍"이다. 3페이지가 비는 건 그냥 끝에 온 것이다.
    isGap: page === 0 && items.length === 0 && q.length > 0,
  };
}

/**
 * 검색을 기록한다. 결과 0건이면 플래너가 이 검색어를 최우선 수집 대상으로 올린다.
 * 실패해도 검색 결과에는 영향을 주지 않는다 — 로그 실패로 화면이 깨지면 안 된다.
 */
export async function logSearch(
  userId: string,
  query: string,
  hitCount: number,
  industryId?: string | null,
  platform?: string | null,
): Promise<void> {
  const q = query.trim();
  if (!q || q.length > 60) return;
  const supabase = await createClient();
  if (!supabase) return;
  const { error } = await supabase.from("search_history").insert({
    user_id: userId,
    query: q,
    hit_count: hitCount,
    industry_id: industryId ?? null,
    platform: platform && platform !== "all" ? platform : null,
  });
  if (error) console.error("[pool] 검색 기록 실패", error.message);
}

/** 업종 허브용 — 노출 자격을 통과한 업종만. RLS 정책이 이미 걸러주지만 정렬만 얹는다. */
export async function listVisibleIndustries(): Promise<
  Array<{ id: string; nameKo: string; groupKey: string; brandCount: number; creativeCount: number }>
> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("industries")
    .select("id, name_ko, group_key, brand_count, creative_count")
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: String(r.id),
    nameKo: String(r.name_ko),
    groupKey: String(r.group_key),
    brandCount: Number(r.brand_count ?? 0),
    creativeCount: Number(r.creative_count ?? 0),
  }));
}
