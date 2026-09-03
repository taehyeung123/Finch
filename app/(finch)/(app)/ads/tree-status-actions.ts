"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AdsWriteFailCode } from "@/lib/ads/campaign-rules";
import {
  passGates,
  recordWrite,
  reserveWrite,
  settleWrite,
  updateWriteSteps,
  type GateOk,
  type WriteAction,
  type WriteResult,
} from "@/lib/ads/write-gates";
import { fetchCampaignAccountId, fetchObjectStatus } from "@/lib/meta/ads";
import { fetchAds, fetchAdSets, fetchObjectOwner } from "@/lib/meta/ads-tree";
import { updateCampaign, updateObjectStatus, writeErrorCode, type AdsWriteError, type AdsWriteResult } from "@/lib/meta/ads-write";

/**
 * 게재 제어 — 2단계 슬라이스 8(스펙 §1.5·§7.2).
 *  · setChildStatusAction: 광고 세트·광고 하나를 ACTIVE/PAUSED 로. 소유 대조는 `GET /{id}?fields=account_id,campaign_id(,adset_id)`.
 *  · activateCampaignTreeAction: 체크된 하위를 **광고 세트 → 광고 → 캠페인** 순으로 켠다(예약 1건 `activate_tree`).
 *    캠페인이 마지막이라 어느 단계가 실패해도 캠페인은 PAUSED 로 남는다 — 되돌리기가 필요 없다(§7.2).
 *
 * 공통 규칙(캠페인 상태 액션과 같다): 일시중지는 예약·쿨다운 없이 기록만 / 켜기는 예약 / 전송 실패는 GET 으로 재확인 /
 * 자동 재시도 금지 / 실패 사유는 코드로만 URL 에 / 클라이언트 id 는 정규식 + 서버 조회 결과와의 교집합만 켠다(§13-3).
 */

const ID_RE = /^\d{1,30}$/;
const UTIL_STOP_PCT = 90;

function detailPath(campaignId: string, params: Record<string, string>): string {
  return `/ads/campaigns/${campaignId}?${new URLSearchParams(params).toString()}`;
}
function failPath(campaignId: string | null, code: AdsWriteFailCode): string {
  return campaignId
    ? detailPath(campaignId, { write: "error", code })
    : `/ads/campaigns?${new URLSearchParams({ write: "error", code }).toString()}`;
}

type Outcome =
  | { kind: "ok" }
  | { kind: "failed"; error: AdsWriteError; code: AdsWriteFailCode }
  | { kind: "unverified"; error: AdsWriteError };

const logResult = (o: Outcome): WriteResult => (o.kind === "ok" ? "ok" : o.kind === "unverified" ? "unverified" : "failed");

/** 상태 쓰기 + 전송 실패 시 GET 재확인(캠페인 액션의 writeStatus 와 같은 판정) */
async function writeStatus(res: AdsWriteResult<unknown>, objectId: string, wanted: "ACTIVE" | "PAUSED", token: string): Promise<Outcome> {
  if (res.ok) return { kind: "ok" };
  if (!res.error.transport) return { kind: "failed", error: res.error, code: writeErrorCode(res.error) };
  const observed = await fetchObjectStatus(objectId, token);
  if (observed === null) return { kind: "unverified", error: res.error };
  if (observed.status === wanted) return { kind: "ok" };
  return { kind: "failed", error: res.error, code: "failed" };
}

function usageTooHigh(res: AdsWriteResult<unknown>): boolean {
  return res.ok && res.usage?.utilPct !== null && res.usage?.utilPct !== undefined && res.usage.utilPct >= UTIL_STOP_PCT;
}

function revalidate(campaignId: string) {
  revalidatePath(`/ads/campaigns/${campaignId}`);
  revalidatePath("/ads/campaigns");
  revalidatePath("/ads");
}

/* ── 광고 세트 · 광고 하나 ─────────────────────────────────────── */

export async function setChildStatusAction(formData: FormData): Promise<void> {
  const kindRaw = String(formData.get("kind") ?? "");
  const objectId = String(formData.get("objectId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  const status = String(formData.get("status") ?? "");
  const validCampaign = ID_RE.test(campaignId) ? campaignId : null;
  if ((kindRaw !== "adset" && kindRaw !== "ad") || !ID_RE.test(objectId) || !validCampaign || (status !== "ACTIVE" && status !== "PAUSED")) {
    redirect(failPath(validCampaign, "invalid_request"));
  }
  const kind = kindRaw as "adset" | "ad";
  const wanted = status as "ACTIVE" | "PAUSED";
  const pausing = wanted === "PAUSED";

  const gates = await passGates({ skipCooldown: pausing });
  if (!gates.ok) redirect(failPath(campaignId, gates.code));
  const { gate } = gates;
  const token = gate.ctx.accessToken;

  /* 소유 대조 — 계정 불일치는 object_not_yours, 확인 실패는 object_unverified(fail-closed). URL 의 캠페인과도 맞아야 한다 */
  const owner = await fetchObjectOwner(kind, objectId, token);
  if (owner === null) redirect(failPath(campaignId, "object_unverified"));
  if (owner.accountId !== gate.ctx.adAccountId || owner.campaignId !== campaignId) redirect(failPath(campaignId, "object_not_yours"));

  const action: WriteAction = kind === "adset" ? "status_adset" : "status_ad";
  const request = { objectId, kind, status: wanted };
  const ids = kind === "adset" ? { campaignId, adsetId: objectId } : { campaignId, adsetId: owner.adsetId, adId: objectId };

  if (pausing) {
    const outcome = await writeStatus(await updateObjectStatus(objectId, wanted, token), objectId, wanted, token);
    await recordWrite(gate, action, request, logResult(outcome), ids, outcome.kind === "ok" ? undefined : outcome.error);
    if (outcome.kind === "failed") redirect(failPath(campaignId, outcome.code));
    revalidate(campaignId);
    if (outcome.kind === "unverified") redirect(failPath(campaignId, "status_unverified"));
    redirect(detailPath(campaignId, { write: "child_paused" }));
  }

  const reservation = await reserveWrite(gate, action, request);
  if (reservation.state === "rejected") redirect(failPath(campaignId, reservation.code));
  /* 켜기는 돈이 나갈 수 있다(캠페인이 게재 중이면 즉시) — 감사 로그 없이는 열지 않는다 */
  if (reservation.state === "no_table") redirect(failPath(campaignId, "not_ready"));

  const outcome = await writeStatus(await updateObjectStatus(objectId, wanted, token), objectId, wanted, token);
  await settleWrite(reservation.logId, logResult(outcome), ids, outcome.kind === "ok" ? undefined : outcome.error);
  if (outcome.kind === "failed") redirect(failPath(campaignId, outcome.code));
  revalidate(campaignId);
  if (outcome.kind === "unverified") redirect(failPath(campaignId, "status_unverified"));
  redirect(detailPath(campaignId, { write: "child_activated" }));
}

/* ── 게재 시작(하위 포함) ──────────────────────────────────────── */

function idList(formData: FormData, key: string): string[] | null {
  const out = new Set<string>();
  for (const v of formData.getAll(key)) {
    const s = String(v);
    if (!ID_RE.test(s)) return null;
    out.add(s);
  }
  return [...out];
}

export async function activateCampaignTreeAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") ?? "");
  const validCampaign = ID_RE.test(campaignId) ? campaignId : null;
  const wantAdsets = idList(formData, "adset");
  const wantAds = idList(formData, "ad");
  if (!validCampaign || wantAdsets === null || wantAds === null) redirect(failPath(validCampaign, "invalid_request"));

  const gates = await passGates();
  if (!gates.ok) redirect(failPath(campaignId, gates.code));
  const { gate } = gates;
  const token = gate.ctx.accessToken;

  const account = await fetchCampaignAccountId(campaignId, token);
  if (account === null) redirect(failPath(campaignId, "campaign_unverified"));
  if (account !== gate.ctx.adAccountId) redirect(failPath(campaignId, "campaign_not_yours"));

  /* 하위는 **서버가 지금 읽은 것**과 체크된 id 의 교집합만 — 클라이언트 목록을 믿지 않는다(§13-3). 못 읽으면 fail-closed */
  const [adsets, ads] = await Promise.all([fetchAdSets(campaignId, token, gate.ctx.currency), fetchAds(campaignId, token)]);
  if (adsets === null || ads === null) redirect(failPath(campaignId, "campaign_unverified"));
  if (ads.length > 0 && ads.every((a) => a.effectiveStatus === "DISAPPROVED")) redirect(failPath(campaignId, "children_disapproved"));

  const adCountByAdset = new Map<string, number>();
  for (const a of ads) if (a.adsetId) adCountByAdset.set(a.adsetId, (adCountByAdset.get(a.adsetId) ?? 0) + 1);
  const adsetTargets = adsets.filter((a) => wantAdsets.includes(a.id) && a.status === "PAUSED" && (adCountByAdset.get(a.id) ?? 0) > 0);
  const adTargets = ads.filter((a) => wantAds.includes(a.id) && a.status === "PAUSED" && a.effectiveStatus !== "DISAPPROVED");

  const pending = ads.filter((a) => a.effectiveStatus === "PENDING_REVIEW").length;
  const disapproved = ads.filter((a) => a.effectiveStatus === "DISAPPROVED").length;
  const request = {
    campaign_id: campaignId,
    adset_ids: adsetTargets.map((a) => a.id),
    ad_ids: adTargets.map((a) => a.id),
    include_children: adsetTargets.length + adTargets.length > 0,
    review_summary: { pending, disapproved, total: ads.length },
    steps: {},
  };

  const reservation = await reserveWrite(gate, "activate_tree", request);
  if (reservation.state === "rejected") redirect(failPath(campaignId, reservation.code));
  if (reservation.state === "no_table") redirect(failPath(campaignId, "not_ready"));
  const logId = reservation.logId;

  const turnedOn: { adsets: string[]; ads: string[] } = { adsets: [], ads: [] };
  const stop = async (result: WriteResult, code: AdsWriteFailCode, error?: AdsWriteError): Promise<never> => {
    await settleWrite(logId, result, { campaignId }, error);
    revalidate(campaignId);
    /* 하위가 하나라도 켜졌으면 «일부만» — 캠페인은 PAUSED 라 비용은 안 나간다 */
    redirect(failPath(campaignId, turnedOn.adsets.length + turnedOn.ads.length > 0 ? "activate_partial" : code));
  };

  /* 1) 광고 세트 → 2) 광고 → 3) 캠페인. 순서가 곧 안전장치다(§7.2) */
  for (const a of adsetTargets) {
    const res = await updateObjectStatus(a.id, "ACTIVE", token);
    const o = await writeStatus(res, a.id, "ACTIVE", token);
    if (o.kind === "failed") return stop("failed", o.code, o.error);
    if (o.kind === "unverified") return stop("unverified", "status_unverified", o.error);
    turnedOn.adsets.push(a.id);
    await updateWriteSteps(logId, { adsets_on: turnedOn.adsets });
    if (usageTooHigh(res)) return stop("failed", "rate_limited");
  }
  for (const a of adTargets) {
    const res = await updateObjectStatus(a.id, "ACTIVE", token);
    const o = await writeStatus(res, a.id, "ACTIVE", token);
    if (o.kind === "failed") return stop("failed", o.code, o.error);
    if (o.kind === "unverified") return stop("unverified", "status_unverified", o.error);
    turnedOn.ads.push(a.id);
    await updateWriteSteps(logId, { ads_on: turnedOn.ads });
    if (usageTooHigh(res)) return stop("failed", "rate_limited");
  }

  const res = await updateCampaign({ campaignId, accessToken: token, status: "ACTIVE" });
  const o = await writeStatus(res, campaignId, "ACTIVE", token);
  if (o.kind === "failed") return stop("failed", o.code, o.error);
  if (o.kind === "unverified") {
    await settleWrite(logId, "unverified", { campaignId }, o.error);
    revalidate(campaignId);
    redirect(failPath(campaignId, "status_unverified"));
  }
  await updateWriteSteps(logId, { campaign_on: true });
  await settleWrite(logId, "ok", { campaignId });
  revalidate(campaignId);
  redirect(detailPath(campaignId, { write: "activated" }));
}

/** 게재 중 캠페인 → 일시중지(상세 화면용). 캠페인 액션과 같은 규칙 — 예약·쿨다운 없이 기록만. 하위는 CAMPAIGN_PAUSED 로 자동 정지 */
export async function pauseCampaignFromDetailAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!ID_RE.test(campaignId)) redirect(failPath(null, "invalid_request"));
  const gates = await passGates({ skipCooldown: true });
  if (!gates.ok) redirect(failPath(campaignId, gates.code));
  const { gate } = gates;
  const token = gate.ctx.accessToken;
  const account = await fetchCampaignAccountId(campaignId, token);
  if (account === null) redirect(failPath(campaignId, "campaign_unverified"));
  if (account !== gate.ctx.adAccountId) redirect(failPath(campaignId, "campaign_not_yours"));

  const o = await writeStatus(await updateCampaign({ campaignId, accessToken: token, status: "PAUSED" }), campaignId, "PAUSED", token);
  await recordWrite(gate, "status", { campaignId, status: "PAUSED" }, logResult(o), { campaignId }, o.kind === "ok" ? undefined : o.error);
  if (o.kind === "failed") redirect(failPath(campaignId, o.code));
  revalidate(campaignId);
  if (o.kind === "unverified") redirect(failPath(campaignId, "status_unverified"));
  redirect(detailPath(campaignId, { write: "paused" }));
}

export type { GateOk };
