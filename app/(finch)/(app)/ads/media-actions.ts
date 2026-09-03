"use server";

import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors";
import { passGates, recordWrite } from "@/lib/ads/write-gates";
import { AD_IMAGE_MAX_BYTES, checkAdImage, type AdImageCheck } from "@/lib/ads/image-spec";
import { IMAGE_HASH_RE } from "@/lib/ads/creative-rules";
import type { AdsWriteFailCode } from "@/lib/ads/campaign-rules";
import { fbPostForm } from "@/lib/meta/ads-write";

/**
 * 광고 이미지 업로드 — 2단계 슬라이스 5(스펙 §4.2 + §13-4).
 *
 * 브라우저 → 이 액션(FormData File) → Meta `POST /act_{id}/adimages` multipart. Storage 를 거치지 않는다(§4.1-A).
 * - 돈은 안 나가지만 쓰기 3점이고 계정 이미지 라이브러리에 남는다 → passGates 는 통과하되 **pending 예약은 없다**
 *   (생성 체인의 잠금과 충돌하고, 마법사에서 제출 전에 끝난다). 쿨다운 대상도 아니다(skipCooldown).
 * - 남용 제한(§13-4): (actor, 5분) 8회 초과 → cooldown · 직전 업로드가 본 점수 ≥ 90% → rate_limited.
 * - `file.size` 는 바이트를 읽기 **전에** 검사한다. 판정은 바이트(매직·SOF/IHDR)로 한다(브라우저 MIME 은 OS 마다 다르다).
 * - 클라이언트에는 {hash, url, width, height} 만 돌아간다. 토큰·파일명·계정 id 는 안 나간다.
 * - 이미지를 교체할 때 이전 hash 는 그대로 재사용한다(재업로드 금지) — 클라이언트 우선.
 */

const UPLOAD_WINDOW_MINUTES = 5;
const UPLOAD_WINDOW_MAX = 8;
const RATE_LIMIT_UTIL_PCT = 90;

export type AdImageUploadResult =
  | { ok: true; hash: string; url: string | null; width: number; height: number }
  | { ok: false; code: AdsWriteFailCode; reason?: Extract<AdImageCheck, { ok: false }>["reason"] };

type UploadLogRequest = { bytes: number; mime: string; width: number; height: number; util_pct: number | null; hash?: string };

/** 최근 업로드 기록으로 남용·점수를 본다 — 표가 없으면(0081 미적용) 제한 없이 통과(기록도 못 하니 막을 근거가 없다) */
async function uploadThrottle(ownerId: string, adAccountId: string, actorId: string): Promise<AdsWriteFailCode | null> {
  const supabase = await createClient();
  const since = new Date(Date.now() - UPLOAD_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("meta_ad_write_log")
    .select("actor_user_id, request, created_at")
    .eq("user_id", ownerId)
    .eq("ad_account_id", adAccountId)
    .eq("action", "upload_image")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(UPLOAD_WINDOW_MAX + 1);
  if (error) {
    if (!isMissingTableError(error)) console.error("[ads-media] 업로드 기록 조회 실패:", error.message);
    return null;
  }
  const rows = (data ?? []) as { actor_user_id: string | null; request: unknown }[];
  const latest = rows[0];
  const latestPct = (latest?.request as { util_pct?: unknown } | null)?.util_pct;
  if (typeof latestPct === "number" && latestPct >= RATE_LIMIT_UTIL_PCT) return "rate_limited";
  const mine = rows.filter((r) => r.actor_user_id === actorId).length;
  if (mine >= UPLOAD_WINDOW_MAX) return "cooldown";
  return null;
}

export async function uploadAdImageAction(formData: FormData): Promise<AdImageUploadResult> {
  const file = formData.get("file");
  /* 바이트를 읽기 전에 크기부터 — 4.5MB 함수 본문 벽 아래지만, 여기서 한 번 더 */
  if (!(file instanceof File)) return { ok: false, code: "media_invalid", reason: "not_image" };
  if (file.size <= 0 || file.size > AD_IMAGE_MAX_BYTES) return { ok: false, code: "media_invalid", reason: "too_large" };

  const gateRes = await passGates({ skipCooldown: true });
  if (!gateRes.ok) return { ok: false, code: gateRes.code };
  const { gate } = gateRes;

  const throttled = await uploadThrottle(gate.ctx.ownerId, gate.ctx.adAccountId, gate.actorId);
  if (throttled) return { ok: false, code: throttled };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkAdImage(bytes);
  if (!check.ok) return { ok: false, code: "media_invalid", reason: check.reason };

  /* 파일 필드 이름이 곧 파일명이고 확장자가 있어야 한다(§4.2-3) */
  const filename = `ad_${crypto.randomUUID()}.${check.ext}`;
  const form = new FormData();
  form.set(filename, new Blob([bytes], { type: check.mime }), filename);

  const res = await fbPostForm<{ images?: Record<string, { hash?: unknown; url?: unknown; url_128?: unknown; width?: unknown; height?: unknown }> }>(
    `/act_${gate.ctx.adAccountId}/adimages`,
    form,
    gate.ctx.accessToken,
  );

  const logBase: UploadLogRequest = {
    bytes: bytes.byteLength,
    mime: check.mime,
    width: check.width,
    height: check.height,
    util_pct: res.ok ? (res.usage?.utilPct ?? null) : null,
  };

  if (!res.ok) {
    await recordWrite(gate, "upload_image", logBase, "failed", {}, res.error);
    if (res.error.rateLimited) return { ok: false, code: "rate_limited" };
    if (res.error.code === 190) return { ok: false, code: "token_expired" };
    return { ok: false, code: "media_upload_failed" };
  }

  const images = res.data.images ?? {};
  const entry = images[filename] ?? Object.values(images)[0];
  const hash = typeof entry?.hash === "string" ? entry.hash : null;
  if (!hash || !IMAGE_HASH_RE.test(hash)) {
    /* 응답은 200 인데 hash 가 없거나 모양이 다르다 — 길이만 남긴다(값은 남기지 않는다: 형식을 모르는 값을 로그에 흘리지 않는다) */
    console.error("[ads-media] adimages 응답에 쓸 수 있는 hash 가 없음:", hash ? `len=${hash.length}` : "none");
    await recordWrite(gate, "upload_image", logBase, "failed", {});
    return { ok: false, code: "media_upload_failed" };
  }

  const url = typeof entry?.url_128 === "string" ? entry.url_128 : typeof entry?.url === "string" ? entry.url : null;
  const width = typeof entry?.width === "number" ? entry.width : check.width;
  const height = typeof entry?.height === "number" ? entry.height : check.height;

  await recordWrite(gate, "upload_image", { ...logBase, hash }, "ok", {});
  return { ok: true, hash, url, width, height };
}
