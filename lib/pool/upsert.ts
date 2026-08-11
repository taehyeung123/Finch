import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CollectedAd } from "@/lib/reference/meta-ads";
import type { CollectedPost } from "@/lib/reference/scrapecreators";
import { adHeat, postHeat } from "@/lib/pool/heat";

/*
  공용 풀 적재 — 수집물을 brands / creatives 로 밀어넣는다.

  핵심은 unique(platform, external_id) 위의 upsert 다. 같은 광고를 열 번 수집해도
  행은 하나이고, last_seen_at 과 지표만 갱신된다. 기존 reference_items 는
  unique(user_id, ...) 였기 때문에 사용자 수만큼 행이 늘었다 — 그게 원가 폭증의 원인이었다.

  같은 소재가 여러 검색어에 걸리는 건 정상이다. 그 중첩(industry_ids·matched_keywords)은
  앱이 아니라 DB 트리거(merge_creative_tags)가 합집합으로 누적한다 — 여기서 배열을
  그대로 보내도 앞선 매칭이 지워지지 않는다.

  업종은 **브랜드 단위**로 붙인다. 소재 하나하나에 AI 를 태우면 500만 건 × AI 호출이지만,
  브랜드는 5만 개고 한 번 정하면 그 브랜드의 모든 소재가 상속받는다. 100배 싸다.
  브랜드가 여러 업종에 걸치면(대형 유통사 등) multi_category 로 표시하고
  그 브랜드의 소재만 나중에 개별 분류 대상으로 돌린다.
*/

const MAX_BODY = 600; // creatives.body 의 CHECK 제약과 같은 값

function trimBody(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= MAX_BODY ? t : `${t.slice(0, MAX_BODY - 1)}…`;
}

/** 본문 첫 줄을 제목으로 — 카드 상단에 쓸 한 줄 */
function titleOf(body: string): string {
  const first = body.split(/[\n.!?·]/)[0]?.trim() ?? "";
  return first.length > 60 ? `${first.slice(0, 59)}…` : first;
}

function runDaysOf(start: string | null, end: string | null, isActive: boolean): number {
  if (!start) return 0;
  const from = new Date(start).getTime();
  const to = isActive || !end ? Date.now() : new Date(end).getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export interface UpsertAdsResult {
  brands: number;
  creatives: number;
}

/**
 * 광고 배치를 풀에 적재한다.
 * @param industryId 이 배치를 건진 키워드의 업종. 브랜드 업종이 비어 있을 때만 씨앗으로 쓴다.
 * @param keyword    매칭 근거 기록용 — "왜 이 검색어에 이게 나왔나"를 나중에 설명할 수 있어야 한다.
 */
export async function upsertAds(
  db: SupabaseClient,
  ads: CollectedAd[],
  industryId: string | null,
  keyword: string,
): Promise<UpsertAdsResult> {
  if (ads.length === 0) return { brands: 0, creatives: 0 };

  /* 1. 브랜드 먼저 — creatives.brand_id 가 여기 의존한다 */
  const byPage = new Map<string, CollectedAd[]>();
  for (const ad of ads) {
    if (!ad.pageId) continue; // page_id 없는 광고는 브랜드에 못 묶는다. 소재로만 남긴다.
    const list = byPage.get(ad.pageId);
    if (list) list.push(ad);
    else byPage.set(ad.pageId, [ad]);
  }

  const brandRows = [...byPage.entries()].map(([pageId, group]) => ({
    platform: "meta",
    external_id: pageId,
    name: group[0].pageName,
    profile_url: group[0].pageProfileUrl,
    industry_ids: industryId ? [industryId] : [],
    industry_source: "seed",
    last_seen_at: new Date().toISOString(),
  }));

  let brandIdByPage = new Map<string, string>();
  if (brandRows.length > 0) {
    // ignoreDuplicates: false — 이름·프로필이 바뀌면 갱신한다.
    // 단 industry_ids 는 여기서 덮어쓰면 AI 가 정한 분류를 시드값이 되돌린다.
    // 그래서 신규 행에만 시드가 들어가도록, 기존 행의 업종은 아래에서 따로 병합한다.
    const { data, error } = await db
      .from("brands")
      .upsert(
        brandRows.map((r) => ({ ...r, industry_ids: undefined })),
        { onConflict: "platform,external_id" },
      )
      .select("id, external_id, industry_ids, industry_source");
    if (error) throw new Error(`브랜드 적재 실패: ${error.message}`);

    brandIdByPage = new Map((data ?? []).map((b) => [String(b.external_id), String(b.id)]));

    // 업종이 아직 빈 브랜드에만 이번 키워드의 업종을 씨앗으로 넣는다.
    if (industryId) {
      const needSeed = (data ?? []).filter(
        (b) =>
          b.industry_source !== "ai" &&
          b.industry_source !== "manual" &&
          (!Array.isArray(b.industry_ids) || b.industry_ids.length === 0),
      );
      if (needSeed.length > 0) {
        await db
          .from("brands")
          .update({ industry_ids: [industryId], industry_source: "seed" })
          .in(
            "id",
            needSeed.map((b) => b.id),
          );
      }
    }
  }

  /* 2. 소재 */
  const now = new Date().toISOString();
  const creativeRows = ads.map((ad) => {
    const body = trimBody(ad.body);
    const runDays = runDaysOf(ad.startDate, ad.endDate, ad.isActive);
    return {
      kind: "ad",
      platform: "meta_ads",
      external_id: ad.adArchiveId,
      brand_id: ad.pageId ? (brandIdByPage.get(ad.pageId) ?? null) : null,
      title: titleOf(body),
      body,
      cta_text: ad.ctaText,
      permalink: ad.url,
      media_format: ad.mediaFormat,
      // thumb_state 는 보내지 않는다 — DB 트리거(normalize_thumb_state)가 정한다.
      // 앱이 정하면 재수집 때마다 캐시가 pending 으로 되돌아가 같은 이미지를 다시 받는다.
      thumb_src: ad.thumbnailUrl,
      is_active: ad.isActive,
      started_at: ad.startDate,
      ended_at: ad.endDate,
      /* 광고의 "게시 시각"은 집행 시작일이다. 이걸 안 채우면 두 가지가 죽는다:
         ① 카드의 "N일 집행 중" 배지 — 이 제품이 파는 핵심 신호가 통째로 사라진다.
         ② '게시 최신순' 정렬 — 광고가 전부 목록 끝으로 밀린다. */
      posted_at: ad.startDate,
      run_days: runDays,
      ad_platforms: ad.platforms,
      industry_ids: industryId ? [industryId] : [],
      industry_source: "keyword",
      matched_keywords: [keyword],
      country: "KR",
      heat_score: adHeat({
        runDays,
        isActive: ad.isActive,
        startedAt: ad.startDate ? new Date(ad.startDate) : null,
        brandActiveAdCount: 0, // 브랜드 프로필 수집 후 finalize 단계에서 재계산
        hasThumb: Boolean(ad.thumbnailUrl),
        bodyLength: body.length,
      }),
      last_seen_at: now,
    };
  });

  const { data: saved, error } = await db
    .from("creatives")
    .upsert(creativeRows, { onConflict: "platform,external_id" })
    .select("id");
  if (error) throw new Error(`소재 적재 실패: ${error.message}`);

  return { brands: brandIdByPage.size, creatives: saved?.length ?? 0 };
}

/** 오가닉 게시물 배치를 풀에 적재한다. 브랜드(계정) 행도 같이 만든다. */
export async function upsertPosts(
  db: SupabaseClient,
  posts: CollectedPost[],
  industryId: string | null,
  keyword: string,
): Promise<UpsertAdsResult> {
  if (posts.length === 0) return { brands: 0, creatives: 0 };

  const now = new Date().toISOString();

  /* 계정 = 브랜드. 핸들이 external_id 다 — 오가닉 경로에는 안정적인 숫자 ID 가 안 온다. */
  const handles = new Map<string, CollectedPost>();
  for (const p of posts) {
    const h = p.creatorHandle.replace(/^@/, "").trim();
    if (h && !handles.has(h)) handles.set(h, p);
  }

  let brandIdByHandle = new Map<string, string>();
  if (handles.size > 0) {
    const { data, error } = await db
      .from("brands")
      .upsert(
        [...handles.entries()].map(([handle, p]) => ({
          platform: p.channel,
          external_id: handle,
          handle: `@${handle}`,
          name: handle,
          follower_count: p.followerCount,
          last_seen_at: now,
        })),
        { onConflict: "platform,external_id" },
      )
      .select("id, external_id");
    if (error) throw new Error(`계정 적재 실패: ${error.message}`);
    brandIdByHandle = new Map((data ?? []).map((b) => [String(b.external_id), String(b.id)]));
  }

  const rows = posts.map((p) => {
    const body = trimBody(p.caption);
    const handle = p.creatorHandle.replace(/^@/, "").trim();
    return {
      kind: "post",
      platform: p.channel,
      external_id: p.externalId,
      brand_id: brandIdByHandle.get(handle) ?? null,
      title: titleOf(body),
      body,
      permalink: p.url,
      media_format: p.mediaFormat,
      thumb_src: p.thumbnailUrl,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      follower_count: p.followerCount,
      industry_ids: industryId ? [industryId] : [],
      industry_source: "keyword",
      matched_keywords: [keyword],
      country: p.region ?? "KR",
      posted_at: p.postedAt,
      heat_score: postHeat({
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        followerCount: p.followerCount,
        postedAt: p.postedAt ? new Date(p.postedAt) : null,
        hasThumb: Boolean(p.thumbnailUrl),
      }),
      last_seen_at: now,
    };
  });

  const { data: saved, error } = await db
    .from("creatives")
    .upsert(rows, { onConflict: "platform,external_id" })
    .select("id");
  if (error) throw new Error(`소재 적재 실패: ${error.message}`);

  return { brands: brandIdByHandle.size, creatives: saved?.length ?? 0 };
}
