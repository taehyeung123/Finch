"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { chargeGeneration, refundGenerationCredits, CREDIT_COSTS } from "@/lib/actions/credits";
import { searchAds, isAdCollectionConfigured, type CollectedAd } from "@/lib/reference/meta-ads";
import { CollectError } from "@/lib/reference/scrapecreators";
import { acquireCollectLock, releaseCollectLock } from "@/lib/reference/engine";
import type { AdSource, ReferenceAd } from "@/lib/types";

/*
  메타광고 레퍼런스 CRUD + 수집 — 마이그레이션 0026_reference_ads.sql 위에서 동작.
  lib/actions/reference.ts(오가닉)와 같은 인증·환불 원칙을 따르되, AI 관련도·요약
  판정은 이번 버전엔 넣지 않는다(카테고리는 "광고" 고정) — 핵심은 검색 결과에
  실제 광고가 뜨는 파이프라인 자체를 먼저 세우는 것. 락은 오가닉 수집과 테이블을
  공유한다(reference_collect_locks, user_id PK) — 사용자 하나가 동시에 두 종류
  수집을 겹쳐 돌리는 걸 막는 용도로는 그대로 재사용해도 안전하다.
*/

const MAX_AD_SOURCES = 10;
const MAX_SOURCES_PER_RUN = 3;
/** 검색어 하나당 가져올 페이지 수 — 페이지당 1크레딧 실비, 페이지당 약 30건 */
const FETCH_PAGES_PER_SOURCE = 2;
const KEEP_PER_SOURCE = 20;
const MAX_TOTAL_PER_RUN = 30;

function normalizeAdValue(raw: string): string | null {
  const v = raw.trim();
  if (v.length < 1 || v.length > 60) return null;
  return v;
}

export type AddAdSourceResult = { ok: true; source: AdSource } | { ok: false; error: string };

export async function listAdSources(): Promise<AdSource[] | null> {
  if (isDemoMode()) return null;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("ad_sources")
    .select("id, value, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[ads-reference] 소스 조회 실패:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id as string, value: r.value as string, createdAt: r.created_at as string }));
}

export async function addAdSource(input: { value: string }): Promise<AddAdSourceResult> {
  const value = normalizeAdValue(String(input.value ?? ""));
  if (!value) return { ok: false, error: "검색 키워드는 1~60자로 입력해주세요." };
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 등록할 수 없습니다." };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { count } = await supabase
    .from("ad_sources")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_AD_SOURCES) {
    return { ok: false, error: `광고 검색 기준은 최대 ${MAX_AD_SOURCES}개까지 등록할 수 있어요.` };
  }

  const { data, error } = await supabase
    .from("ad_sources")
    .insert({ user_id: user.id, value })
    .select("id, value, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 등록된 검색어예요." };
    const missing = error.message.includes("does not exist") || error.message.includes("Could not find the table");
    console.error("[ads-reference] 소스 등록 실패:", error.message);
    return {
      ok: false,
      error: missing
        ? "메타광고 수집 기능이 아직 준비되지 않았습니다(마이그레이션 0026 미적용). 잠시 후 다시 시도해주세요."
        : "등록에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  revalidatePath("/library");
  return { ok: true, source: { id: data.id as string, value: data.value as string, createdAt: data.created_at as string } };
}

export async function removeAdSource(id: string): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false };

  const { error } = await supabase.from("ad_sources").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[ads-reference] 소스 삭제 실패:", error.message);
    return { ok: false };
  }
  revalidatePath("/library");
  return { ok: true };
}

interface DbAdRow {
  id: string;
  ad_archive_id: string;
  page_name: string;
  page_profile_url: string | null;
  body: string;
  cta_text: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  platforms: string[] | null;
  matched_source: string;
  ai_comment: string;
  category: string;
  status: string;
  favorite: boolean;
  collected_at: string;
}

function rowToAd(r: DbAdRow): ReferenceAd {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(r.collected_at).getTime()) / 3_600_000));
  return {
    id: r.id,
    adArchiveId: r.ad_archive_id,
    pageName: r.page_name,
    pageProfileUrl: r.page_profile_url,
    body: r.body,
    ctaText: r.cta_text,
    thumbnailUrl: r.thumbnail_url,
    isActive: r.is_active,
    startDate: r.start_date,
    endDate: r.end_date,
    platforms: r.platforms ?? [],
    matchedSource: r.matched_source,
    aiComment: r.ai_comment || "",
    category: r.category || "광고",
    status: r.status === "seen" || r.status === "skipped" ? r.status : "unseen",
    favorite: r.favorite,
    collectedAgoHours: hours,
  };
}

/** 실 모드 수집 광고 목록 — 페이지 서버 컴포넌트용 */
export async function listReferenceAds(): Promise<ReferenceAd[]> {
  if (isDemoMode()) return [];
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("reference_ads")
    .select(
      "id, ad_archive_id, page_name, page_profile_url, body, cta_text, thumbnail_url, is_active, start_date, end_date, platforms, matched_source, ai_comment, category, status, favorite, collected_at",
    )
    .eq("user_id", user.id)
    .order("collected_at", { ascending: false })
    .limit(60);
  if (error) {
    const missing = error.message.includes("does not exist") || error.message.includes("Could not find the table");
    if (!missing) console.error("[ads-reference] 광고 조회 실패:", error.message);
    return [];
  }
  return (data ?? []).map((r) => rowToAd(r as unknown as DbAdRow));
}

export async function deleteReferenceAd(id: string): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from("reference_ads").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[ads-reference] 광고 삭제 실패:", error.message);
    return { ok: false };
  }
  revalidatePath("/library");
  return { ok: true };
}

export async function toggleAdFavorite(id: string, favorite: boolean): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from("reference_ads").update({ favorite }).eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[ads-reference] 즐겨찾기 갱신 실패:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

export async function setAdStatus(id: string, status: "unseen" | "seen" | "skipped"): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  if (!["unseen", "seen", "skipped"].includes(status)) return { ok: false };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from("reference_ads").update({ status }).eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[ads-reference] 상태 변경 실패:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

export type AdCollectRunResult =
  | { ok: true; added: number; duplicates: number; usedSources: number; totalSources: number; failedSources: string[] }
  | {
      ok: false;
      reason: "demo" | "auth" | "no_sources" | "not_configured" | "charge" | "out_of_credits" | "table_missing" | "provider" | "already_running";
      error: string;
    };

/**
 * 지금 수집(메타광고) — 등록 검색어로 KR 상업광고 검색 → 중복 제거 → 저장.
 * 과금: 무료 월 한도(ad_collect) → 크레딧. 전량 실패·신규 0건이면 크레딧 환불.
 */
export async function runAdCollection(): Promise<AdCollectRunResult> {
  if (isDemoMode()) return { ok: false, reason: "demo", error: "데모 모드에서는 수집할 수 없습니다." };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, reason: "auth", error: "로그인이 필요합니다." };

  if (!isAdCollectionConfigured()) {
    return { ok: false, reason: "not_configured", error: "광고 수집 엔진 설정이 완료되지 않았어요. 잠시 후 다시 시도해 주세요." };
  }

  const lock = await acquireCollectLock(supabase, user.id);
  if (lock === "error") return { ok: false, reason: "provider", error: "수집을 시작하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (lock === "already_running") {
    return { ok: false, reason: "already_running", error: "이미 수집이 진행 중이에요. 잠시 후 다시 시도해 주세요." };
  }

  try {
    const { data: sourceRows, error: srcErr } = await supabase
      .from("ad_sources")
      .select("id, value")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (srcErr) {
      console.error("[ads-reference] 수집 기준 조회 실패:", srcErr.message);
      return { ok: false, reason: "provider", error: "수집 기준을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
    const sources = (sourceRows ?? []) as { id: string; value: string }[];
    if (sources.length === 0) {
      return { ok: false, reason: "no_sources", error: "먼저 메타광고 검색 키워드를 등록해 주세요." };
    }

    const charge = await chargeGeneration({ metric: "ad_collect", creditCost: CREDIT_COSTS.adCollect, reason: "ad_collect" });
    if (!charge.ok) return { ok: false, reason: "charge", error: charge.error };
    const refundIfCharged = async (why: string) => {
      if (charge.via === "credits") {
        await refundGenerationCredits(charge.userId, CREDIT_COSTS.adCollect, `ad_collect_refund: ${why}`);
      }
    };

    const used = sources.slice(0, MAX_SOURCES_PER_RUN);

    const { data: existingRows } = await supabase.from("reference_ads").select("ad_archive_id").eq("user_id", user.id);
    const existingIds = new Set((existingRows ?? []).map((r) => r.ad_archive_id as string));
    const insertedThisRun = new Set<string>();

    let added = 0;
    let duplicates = 0;
    const failedSources: string[] = [];
    const failures: CollectError[] = [];

    for (const src of used) {
      if (added >= MAX_TOTAL_PER_RUN) break;

      const pageResults = await Promise.allSettled(
        Array.from({ length: FETCH_PAGES_PER_SOURCE }, (_, i) => searchAds(src.value, i + 1)),
      );
      const ads: CollectedAd[] = [];
      let anyFulfilled = false;
      for (const r of pageResults) {
        if (r.status === "fulfilled") {
          anyFulfilled = true;
          ads.push(...r.value);
        } else {
          const err = r.reason instanceof CollectError ? r.reason : new CollectError("provider_error", String(r.reason));
          failures.push(err);
        }
      }
      if (!anyFulfilled) {
        failedSources.push(src.value);
        continue;
      }

      const room = MAX_TOTAL_PER_RUN - added;
      const fresh: CollectedAd[] = [];
      for (const ad of ads) {
        if (fresh.length >= Math.min(KEEP_PER_SOURCE, room)) break;
        if (existingIds.has(ad.adArchiveId) || insertedThisRun.has(ad.adArchiveId)) {
          duplicates++;
          continue;
        }
        insertedThisRun.add(ad.adArchiveId);
        fresh.push(ad);
      }
      if (fresh.length === 0) continue;

      const rows = fresh.map((ad) => ({
        user_id: user.id,
        ad_archive_id: ad.adArchiveId,
        page_name: ad.pageName,
        page_profile_url: ad.pageProfileUrl,
        body: ad.body.slice(0, 500),
        cta_text: ad.ctaText,
        thumbnail_url: ad.thumbnailUrl,
        is_active: ad.isActive,
        start_date: ad.startDate,
        end_date: ad.endDate,
        platforms: ad.platforms,
        matched_source: src.value,
        category: "광고",
      }));

      const { error: insertErr } = await supabase.from("reference_ads").insert(rows);
      if (insertErr) {
        const missing = insertErr.message.includes("does not exist") || insertErr.message.includes("Could not find the table");
        console.error(`[ads-reference] 기준 '${src.value}' 저장 실패:`, insertErr.message);
        if (missing) {
          await refundIfCharged("table_missing");
          return {
            ok: false,
            reason: "table_missing",
            error: "메타광고 저장소가 아직 준비되지 않았습니다(마이그레이션 0026 미적용). 잠시 후 다시 시도해 주세요.",
          };
        }
        failures.push(new CollectError("provider_error", insertErr.message));
        failedSources.push(src.value);
        for (const ad of fresh) insertedThisRun.delete(ad.adArchiveId);
        continue;
      }
      added += fresh.length;
    }

    if (added === 0) {
      await refundIfCharged("all_failed_or_empty");
      if (failures.some((f) => f.reason === "out_of_credits")) {
        return {
          ok: false,
          reason: "out_of_credits",
          error: "수집 엔진 사용량이 일시적으로 소진됐어요. 잠시 후 다시 시도해 주세요 — 사용하신 횟수는 차감되지 않았습니다.",
        };
      }
      if (failures.length > 0) {
        console.error("[ads-reference] 수집 전량 실패:", failures.map((f) => f.message).join(" / "));
        return {
          ok: false,
          reason: "provider",
          error: "수집에 실패했어요. 잠시 후 다시 시도해 주세요 — 사용하신 횟수는 차감되지 않았습니다.",
        };
      }
      if (duplicates > 0) {
        return {
          ok: false,
          reason: "provider",
          error: `${duplicates}개를 발견했지만 전부 이미 수집된 광고예요. 새 광고가 게재되면 다시 수집돼요 — 사용하신 횟수는 차감되지 않았습니다.`,
        };
      }
      return {
        ok: false,
        reason: "provider",
        error: "등록된 검색어로 게재 중인 광고를 찾지 못했어요. 더 널리 쓰이는 말로 바꿔보세요 — 사용하신 횟수는 차감되지 않았습니다.",
      };
    }

    revalidatePath("/library");
    return { ok: true, added, duplicates, usedSources: used.length, totalSources: sources.length, failedSources };
  } finally {
    await releaseCollectLock(supabase, user.id);
  }
}
