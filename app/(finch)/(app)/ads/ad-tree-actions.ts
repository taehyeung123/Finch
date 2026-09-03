"use server";

import { revalidatePath } from "next/cache";
import { getAdsWriteContext } from "@/lib/data/ads";
import { passGates, reserveWrite, settleWrite, updateWriteSteps, type WriteIds } from "@/lib/ads/write-gates";
import {
  ADSET_NAME_MAX,
  adsetAutoName,
  adsetSpecFor,
  buildAdSetParams,
  buildTargeting,
  parseTargetingInput,
  validateAdSetInput,
  type AdSetInput,
} from "@/lib/ads/adset-rules";
import {
  AD_NAME_MAX,
  buildAdParams,
  buildCreativeParams,
  buildCreativeSpec,
  CTA_LABELS,
  creativeAutoName,
  DESCRIPTION_MAX,
  HEADLINE_MAX,
  IMAGE_HASH_RE,
  LINK_MAX,
  MESSAGE_MAX,
  validateCreativeInput,
  type CreativeInput,
  type CtaType,
} from "@/lib/ads/creative-rules";
import { CREATABLE_OBJECTIVES, type AdsWriteFailCode, type CreatableObjective } from "@/lib/ads/campaign-rules";
import { fetchAdSets, fetchCampaignDetail } from "@/lib/meta/ads-tree";
import { validateInterestIds } from "@/lib/meta/ads-targeting";
import {
  CAMPAIGN_BID_STRATEGY,
  createAd,
  createAdCreative,
  createAdSet,
  updateCampaign,
  writeErrorCode,
  type AdsWriteError,
  type AdsWriteResult,
} from "@/lib/meta/ads-write";
import { AD_PREVIEW_FORMATS, generateAdPreview, type AdPreviewFormat } from "@/lib/meta/ads-preview";

/**
 * 광고 세트 → 소재 → 광고 생성 체인 — 2단계 슬라이스 6(스펙 §2.1·§7).
 *
 * 관문(passGates) → **pending 예약 1건(create_ad)** → 캠페인 소유 대조·규칙 → 기존 광고 세트 대조 →
 * 관심사 재검증 → validate_only(광고 세트·소재) → 광고 세트 생성 → 소재 생성 → validate_only(광고) → 광고 생성 → 확정.
 *
 * ⚠️ 만들어지는 것은 전부 **PAUSED 상수**(adset-rules·creative-rules). 이 액션으로는 돈이 나가지 않는다.
 * ⚠️ 클라이언트를 믿지 않는다 — id 는 정규식, 타겟은 parseTargetingInput, 페이지·IG 는 **DB 값**, 관심사 이름은 메타 응답 값.
 * ⚠️ 부분 실패는 지우지 않는다(§7.5) — steps 에 id 를 남기고 partial_created 로 상세 화면에 보낸다.
 * ⚠️ 쓰기 자동 재시도 금지. 매 쓰기 뒤 usage 90% 이상이면 다음 쓰기 전에 멈춘다(§2.1).
 * ⚠️ 감사 로그 표가 없으면 생성도 막는다(§7.1 — 캠페인 생성과 다르다).
 */

const ID_RE = /^\d{1,30}$/;
const UTIL_STOP_PCT = 90;

export interface CreateAdTreeInput {
  campaignId: string;
  adset: {
    name: string;
    targeting: unknown;
    /** UNIX 초 */
    startTime: number;
    endTime: number | null;
  };
  creative: {
    message: string;
    headline: string;
    description: string;
    link: string;
    cta: string;
    imageHash: string;
    adName: string;
  };
}

export type CreateAdTreeResult =
  | { ok: true; campaignId: string; adsetId: string; adId: string }
  | {
      ok: false;
      code: AdsWriteFailCode;
      /** 어느 단계로 돌아가 고쳐야 하는지 — 1 광고 세트 · 2 소재 · 3 확인 */
      step: 1 | 2 | 3;
      /** 규칙 문구(validate*)가 있을 때 — 없으면 화면이 adsWriteMessage(code) 를 쓴다 */
      message?: string;
    };

type Parsed =
  | { ok: true; campaignId: string; adset: { name: string; targeting: NonNullable<ReturnType<typeof parseTargetingInput>>; startTime: number; endTime: number | null }; creative: CreativeInput }
  | { ok: false; step: 1 | 2 | 3 };

function strField(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

function parseInput(raw: unknown): Parsed {
  if (!raw || typeof raw !== "object") return { ok: false, step: 3 };
  const r = raw as Record<string, unknown>;
  if (typeof r.campaignId !== "string" || !ID_RE.test(r.campaignId)) return { ok: false, step: 3 };

  const a = (r.adset ?? {}) as Record<string, unknown>;
  const targeting = parseTargetingInput(a.targeting);
  const adsetName = strField(a.name, ADSET_NAME_MAX);
  if (!targeting || adsetName === null) return { ok: false, step: 1 };
  if (!Number.isInteger(a.startTime) || (a.startTime as number) <= 0) return { ok: false, step: 1 };
  if (a.endTime !== null && (!Number.isInteger(a.endTime) || (a.endTime as number) <= 0)) return { ok: false, step: 1 };

  const c = (r.creative ?? {}) as Record<string, unknown>;
  const message = strField(c.message, MESSAGE_MAX);
  const headline = strField(c.headline, HEADLINE_MAX);
  const description = strField(c.description, DESCRIPTION_MAX);
  const link = strField(c.link, LINK_MAX);
  const imageHash = strField(c.imageHash, 128);
  const adName = strField(c.adName, AD_NAME_MAX);
  const cta = typeof c.cta === "string" && c.cta in CTA_LABELS ? (c.cta as CtaType) : null;
  if (message === null || headline === null || description === null || link === null || imageHash === null || adName === null || cta === null) {
    return { ok: false, step: 2 };
  }
  if (!IMAGE_HASH_RE.test(imageHash)) return { ok: false, step: 2 };

  return {
    ok: true,
    campaignId: r.campaignId,
    adset: { name: adsetName, targeting, startTime: a.startTime as number, endTime: (a.endTime as number | null) ?? null },
    creative: { message, headline, description, link, cta, imageHash, adName },
  };
}

function usageTooHigh(res: AdsWriteResult<unknown>): boolean {
  return res.ok && res.usage?.utilPct !== null && res.usage?.utilPct !== undefined && res.usage.utilPct >= UTIL_STOP_PCT;
}

/** 광고 세트 오류 → 코드. 7자리 검증 코드는 writeErrorCode 가 표로 푼다 */
function adsetErrorCode(e: AdsWriteError): AdsWriteFailCode {
  return writeErrorCode(e);
}

/** 소재 오류 → 코드. 권한(200/10/294)은 «페이지 역할»이다(§13-21) — 광고 계정 쓰기 권한이 아니다 */
function creativeErrorCode(e: AdsWriteError): AdsWriteFailCode {
  if (e.code === 200 || e.code === 10 || e.code === 294) return "page_role_required";
  const c = writeErrorCode(e);
  return c === "bad_input" ? "bad_input_ad" : c;
}

export async function createAdTreeAction(raw: unknown): Promise<CreateAdTreeResult> {
  const parsed = parseInput(raw);
  if (!parsed.ok) return { ok: false, code: "invalid_request", step: parsed.step };
  const { campaignId, adset, creative } = parsed;

  const gates = await passGates();
  if (!gates.ok) return { ok: false, code: gates.code, step: 3 };
  const { gate } = gates;
  const { ctx } = gate;
  const token = ctx.accessToken;
  const acct = ctx.adAccountId;

  /* 게시 주체는 **DB 값**만 쓴다 — 제출값에 page/ig 가 있어도 보지 않는다(§7.3) */
  const publisher = ctx.publisher;
  if (!publisher) return { ok: false, code: "page_required", step: 2 };

  /* 감사 로그 request — 토큰·이미지 바이트 없음. steps 는 체인이 진행되며 갱신된다(§6.3) */
  const logRequest = {
    campaign_id: campaignId,
    adset: {
      name: adset.name,
      targeting: buildTargeting(adset.targeting),
      start_time: adset.startTime,
      end_time: adset.endTime,
    },
    creative: {
      page_id: publisher.pageId,
      instagram_user_id: publisher.igUserId,
      image_hash: creative.imageHash,
      link: creative.link.trim(),
      cta: creative.cta,
      message: creative.message.trim(),
      name: creative.headline.trim(),
      description: creative.description.trim() || null,
    },
    ad: { name: creative.adName.trim(), conversion_domain: null },
    steps: {},
  };

  const reservation = await reserveWrite(gate, "create_ad", logRequest);
  if (reservation.state === "rejected") return { ok: false, code: reservation.code, step: 3 };
  /* 캠페인 생성과 달리 **생성도 막는다** — 광고 세트·광고는 게재 객체라 기록 없이 만들지 않는다(§7.1) */
  if (reservation.state === "no_table") return { ok: false, code: "not_ready", step: 3 };
  const logId = reservation.logId;

  const failLog = async (
    code: AdsWriteFailCode,
    step: 1 | 2 | 3,
    error?: AdsWriteError,
    ids: WriteIds = { campaignId },
    message?: string,
  ): Promise<CreateAdTreeResult> => {
    await settleWrite(logId, "failed", ids, error);
    return message ? { ok: false, code, step, message } : { ok: false, code, step };
  };

  /* 0 — 캠페인: 소유 대조 + 규칙 입력. null 은 fail-closed */
  const campaign = await fetchCampaignDetail(campaignId, token, ctx.currency);
  if (!campaign) return failLog("campaign_unverified", 3);
  if (campaign.accountId === null || campaign.accountId !== acct) return failLog("campaign_not_yours", 3);
  const spec = adsetSpecFor(campaign.objective);
  if (!spec || !campaign.objective || !(CREATABLE_OBJECTIVES as readonly string[]).includes(campaign.objective)) {
    return failLog("campaign_objective_unsupported", 3);
  }
  const objective = campaign.objective as CreatableObjective;
  /* 게재 중 캠페인에 덧붙이기는 2차(§1.1) — 서버가 유일한 관문이라 여기서도 막는다 */
  if (campaign.status === "ACTIVE") return failLog("campaign_active_create", 3);

  /* 규칙(화면=서버) */
  const adsetInput: AdSetInput = {
    name: adset.name.trim() || adsetAutoName(campaign.name, 1),
    ...adset.targeting,
    startTime: adset.startTime,
    endTime: adset.endTime,
  };
  const adsetRule = validateAdSetInput(adsetInput, { specialCategories: campaign.specialAdCategories });
  if (adsetRule) return failLog("invalid_request", 1, undefined, { campaignId }, adsetRule);
  const creativeInput: CreativeInput = { ...creative, adName: creative.adName.trim() || creativeAutoName(campaign.name, 1) };
  const creativeRule = validateCreativeInput(creativeInput, objective);
  if (creativeRule) return failLog("invalid_request", 2, undefined, { campaignId }, creativeRule);

  /* 0' — 기존 광고 세트: 자동 입찰 CBO 는 optimization_goal 이 전부 같아야 한다. null 은 fail-closed */
  const existing = await fetchAdSets(campaignId, token, ctx.currency);
  if (existing === null) return failLog("campaign_unverified", 3);
  if (existing.some((a) => a.optimizationGoal && a.optimizationGoal !== spec.optimizationGoal)) {
    return failLog("campaign_mixed_goals", 3);
  }
  await updateWriteSteps(logId, {
    objective,
    optimization_goal: spec.optimizationGoal,
    destination_type: spec.destinationType ?? null,
    existing_adsets: existing.length,
  });

  /* 입찰 전략 — BID_CAP/COST_CAP 캠페인은 광고 세트마다 bid_amount 가 필요하다. 광고 세트가 0개면 자동 입찰로 고치고 계속(§13-7) */
  if (campaign.bidStrategy && campaign.bidStrategy !== CAMPAIGN_BID_STRATEGY) {
    if (existing.length > 0) return failLog("campaign_bid_cap", 3);
    const fix = await updateCampaign({ campaignId, accessToken: token, bidStrategy: CAMPAIGN_BID_STRATEGY });
    if (!fix.ok) return failLog(fix.error.transport ? "campaign_unverified" : writeErrorCode(fix.error), 3, fix.error);
    await updateWriteSteps(logId, { bid_fix: "ok" });
    if (usageTooHigh(fix)) return failLog("rate_limited", 3);
  }

  /* 관심사 재검증 — 이름은 메타 응답의 것으로 바꾼다. 응답에 없는 id 는 «무효»가 아니라 «확인 못 함»이지만 돈 경로라 보수적으로 막는다 */
  if (adsetInput.interests.length > 0) {
    const v = await validateInterestIds(acct, adsetInput.interests.map((i) => i.id), token);
    if (!v.ok) return failLog(v.error.rateLimited ? "rate_limited" : "targeting_unverified", 1, v.error);
    if (v.data.invalid.length > 0 || v.data.unknown.length > 0) return failLog("targeting_deprecated", 1);
    adsetInput.interests = v.data.valid;
  }

  const adsetCtx = { campaignId, spec, pageId: publisher.pageId };
  const creativeCtx = { pageId: publisher.pageId, igUserId: publisher.igUserId, campaignName: campaign.name };

  /* 1 — 광고 세트 검증(만들지 않는다) */
  const v1 = await createAdSet(acct, buildAdSetParams(adsetInput, { ...adsetCtx, validateOnly: true }), token);
  if (!v1.ok) return failLog(adsetErrorCode(v1.error), 1, v1.error);
  await updateWriteSteps(logId, { adset_validate: "ok" });
  if (usageTooHigh(v1)) return failLog("rate_limited", 3);

  /* 2 — 소재 검증(페이지·IG 권한이 여기서 걸린다) */
  const v2 = await createAdCreative(acct, buildCreativeParams(creativeInput, { ...creativeCtx, validateOnly: true }), token);
  if (!v2.ok) return failLog(creativeErrorCode(v2.error), 2, v2.error);
  await updateWriteSteps(logId, { creative_validate: "ok" });
  if (usageTooHigh(v2)) return failLog("rate_limited", 3);

  /* 3 — 광고 세트 생성(PAUSED) */
  const c3 = await createAdSet(acct, buildAdSetParams(adsetInput, adsetCtx), token);
  if (!c3.ok) return failLog(c3.error.transport ? "create_unverified" : adsetErrorCode(c3.error), 1, c3.error);
  const adsetId = c3.data.id;
  if (!adsetId || !ID_RE.test(adsetId)) return failLog("create_unverified", 3);
  await updateWriteSteps(logId, { adset_id: adsetId });
  const partialIds: WriteIds = { campaignId, adsetId };
  if (usageTooHigh(c3)) return failLog("partial_created", 3, undefined, partialIds);

  /* 4 — 소재 생성 */
  const c4 = await createAdCreative(acct, buildCreativeParams(creativeInput, creativeCtx), token);
  if (!c4.ok) return failLog(c4.error.transport ? "create_unverified" : "partial_created", 3, c4.error, partialIds);
  const creativeId = c4.data.id;
  if (!creativeId || !ID_RE.test(creativeId)) return failLog("partial_created", 3, undefined, partialIds);
  await updateWriteSteps(logId, { creative_id: creativeId });
  if (usageTooHigh(c4)) return failLog("partial_created", 3, undefined, partialIds);

  /* 5 — 광고 검증(부모 id 가 있어야 검증된다) */
  const adBase = { name: creativeInput.adName, adsetId, creativeId };
  const v5 = await createAd(acct, buildAdParams({ ...adBase, validateOnly: true }), token);
  if (!v5.ok) return failLog("partial_created", 3, v5.error, partialIds);
  await updateWriteSteps(logId, { ad_validate: "ok" });
  if (usageTooHigh(v5)) return failLog("partial_created", 3, undefined, partialIds);

  /* 6 — 광고 생성(PAUSED) */
  const c6 = await createAd(acct, buildAdParams(adBase), token);
  if (!c6.ok) return failLog(c6.error.transport ? "create_unverified" : "partial_created", 3, c6.error, partialIds);
  const adId = c6.data.id;
  if (!adId || !ID_RE.test(adId)) return failLog("create_unverified", 3, undefined, partialIds);

  await settleWrite(logId, "ok", { campaignId, adsetId, adId });
  revalidatePath(`/ads/campaigns/${campaignId}`);
  revalidatePath("/ads/campaigns");
  revalidatePath("/ads");
  return { ok: true, campaignId, adsetId, adId };
}

/* ── 미리보기(슬라이스 7) — 소재를 만들기 전 generatepreviews. 읽기라 예약·쿨다운 없음 ── */

export type AdPreviewResult = { ok: true; src: string; width: number; height: number } | { ok: false; code: AdsWriteFailCode };

export async function generateAdPreviewAction(raw: unknown): Promise<AdPreviewResult> {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_request" };
  const r = raw as Record<string, unknown>;
  const format = typeof r.format === "string" && r.format in AD_PREVIEW_FORMATS ? (r.format as AdPreviewFormat) : null;
  const objective =
    typeof r.objective === "string" && (CREATABLE_OBJECTIVES as readonly string[]).includes(r.objective)
      ? (r.objective as CreatableObjective)
      : null;
  const campaignName = strField(r.campaignName, 400) ?? "";
  const c = (r.creative ?? {}) as Record<string, unknown>;
  const message = strField(c.message, MESSAGE_MAX);
  const headline = strField(c.headline, HEADLINE_MAX);
  const description = strField(c.description, DESCRIPTION_MAX);
  const link = strField(c.link, LINK_MAX);
  const imageHash = strField(c.imageHash, 128);
  const cta = typeof c.cta === "string" && c.cta in CTA_LABELS ? (c.cta as CtaType) : null;
  if (!format || !objective || message === null || headline === null || description === null || link === null || imageHash === null || cta === null) {
    return { ok: false, code: "invalid_request" };
  }
  const creative: CreativeInput = { message, headline, description, link, cta, imageHash, adName: "preview" };
  if (validateCreativeInput(creative, objective)) return { ok: false, code: "invalid_request" };

  const ctx = await getAdsWriteContext();
  if (ctx.state === "blocked") return { ok: false, code: ctx.code };
  if (!ctx.publisher) return { ok: false, code: "page_required" };

  const spec = buildCreativeSpec(creative, { pageId: ctx.publisher.pageId, igUserId: ctx.publisher.igUserId, campaignName });
  const res = await generateAdPreview(ctx.adAccountId, spec, format, ctx.accessToken);
  if (!res.ok) {
    if (res.error.rateLimited) return { ok: false, code: "rate_limited" };
    if (res.error.code === 190) return { ok: false, code: "token_expired" };
    if (res.error.code === 200 || res.error.code === 10 || res.error.code === 294) return { ok: false, code: "page_role_required" };
    return { ok: false, code: "preview_failed" };
  }
  if (!res.data) return { ok: false, code: "preview_failed" };
  return { ok: true, src: res.data.src, width: res.data.width, height: res.data.height };
}
