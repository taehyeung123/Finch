/* service_role 클라이언트로 비공개 버킷의 서명 URL 을 만든다 — 서버 전용 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishError, type PublishError } from "@/lib/meta/publish-errors";
import { PUBLISH_MEDIA_BUCKET, resolvePostItems, type ResolvedItem } from "@/lib/publish/media-core";

/*
  발행 미디어 — 메타에 넘길 URL 만들기 (2026-09-11 영상 발행).

  파일은 비공개 버킷 publish-media 에 있다(0093). 메타는 image_url/video_url 을 **직접 가져가므로**, 준비물을 만들 때마다
  짧은 서명 읽기 URL 을 새로 만든다. 버킷을 공개로 두면 경로를 아는 사람 누구나 받아 갈 수 있고(무료 파일 호스팅),
  초안 파일은 지워지지 않으니 영구 공개가 된다.

  ⚠️ 메타가 쿼리 토큰 붙은 서명 URL 을 받는지는 **S0 실측 전**이다(docs/PUBLISH_VIDEO_PLAN.md). 안 받으면 META_FETCH_MODE 를
  "public" 으로 바꾸고, **같은 커밋에서** 공개 전용 복사 경로를 만든다(비공개 버킷을 통째로 공개로 돌리지 말 것 — 초안이 영구 공개된다).
  이건 런타임 폴백이 아니다 — 서명 URL 이 실패했다고 공개 URL 로 다시 시도하지 않는다(CLAUDE.md «폴백 금지»).
*/

export { PUBLISH_MEDIA_BUCKET };
/** S0 결과로 한 번 정한다 — 런타임 폴백이 아니다 */
export const META_FETCH_MODE: "signed" | "public" = "signed";
/** 서명 읽기 URL 수명 — 메타가 영상을 받아 가는 동안(처리 대기 포함) 살아 있어야 한다 */
export const META_FETCH_URL_TTL_S = 6 * 60 * 60;

function supabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/**
 * 게시물 행 → 발행할 항목. DB 체크(publish_media_shape_ok)와 같은 규칙을 코드도 본다 + 옛 image_urls 는
 * 우리 Supabase 오리진의 cardnews 버킷·그 사용자 폴더인지 경로 전체로 확인한다.
 */
export function parsePostMedia(row: {
  user_id: string;
  channel: string;
  media: unknown;
  image_urls: string[] | null;
}): { ok: true; items: ResolvedItem[] } | { ok: false; error: PublishError } {
  const res = resolvePostItems(row, supabaseOrigin());
  if (!res.ok) return { ok: false, error: publishError("MEDIA_INVALID", row.channel, "media_shape") };
  return res;
}

/**
 * 항목 → 메타가 가져갈 URL(항목 순서 그대로).
 * publish-media 는 createSignedUrls 한 번(결과는 **경로로** 맞춘다 — 순서를 믿지 않는다), 옛 cardnews 는 경로로 공개 URL 을 다시 조립한다.
 * 파일이 하나라도 없으면 MEDIA_MISSING — "null" 이나 엉뚱한 순서를 메타에 보내지 않는다.
 */
export async function mintFetchUrls(
  admin: SupabaseClient,
  items: ResolvedItem[],
  channel: string,
): Promise<{ ok: true; urls: string[] } | { ok: false; error: PublishError }> {
  const own = items.filter((i) => i.source === "publish-media").map((i) => i.path);
  const signed = new Map<string, string>();
  if (own.length > 0) {
    if (META_FETCH_MODE === "public") {
      /* S0 에서 공개로 정하면 이 분기를 공개 복사 경로로 채운다(위 머리말). 지금은 도달하지 않는다. */
      return { ok: false, error: publishError("MEDIA_FETCH_FAILED", channel, "public_mode_not_implemented") };
    }
    const { data, error } = await admin.storage.from(PUBLISH_MEDIA_BUCKET).createSignedUrls(own, META_FETCH_URL_TTL_S);
    if (error || !data) {
      return { ok: false, error: publishError("TRANSIENT", channel, `sign_failed: ${error?.message ?? "no data"}`) };
    }
    for (const row of data) {
      if (row.path && row.signedUrl && !row.error) signed.set(row.path, row.signedUrl);
    }
  }
  const urls: string[] = [];
  for (const it of items) {
    if (it.source === "publish-media") {
      const u = signed.get(it.path);
      if (!u) return { ok: false, error: publishError("MEDIA_MISSING", channel, `missing: ${it.path}`) };
      urls.push(u);
    } else {
      urls.push(admin.storage.from("cardnews").getPublicUrl(it.path).data.publicUrl);
    }
  }
  return { ok: true, urls };
}

/**
 * 하루 전송 예산 — 준비물을 만들 때마다 메타가 파일을 다시 받아 간다(Supabase 전송량 과금).
 * 상한은 DB 함수 하나가 갖는다(publish_consume_fetch_bytes, 0093) — JS 카운터는 인스턴스마다 갈라진다.
 * 조회·기록이 실패하면 **닫힌다**(transient) — «확인 못 함»을 «여유 있음»으로 읽지 않는다.
 */
export async function consumeFetchBudget(
  admin: SupabaseClient,
  userId: string,
  items: ResolvedItem[],
  channel: string,
): Promise<{ ok: true } | { ok: false; error: PublishError }> {
  const bytes = items.reduce((n, i) => n + (i.source === "publish-media" ? (i.bytes ?? 0) : 0), 0);
  if (bytes <= 0) return { ok: true };
  const { data, error } = await admin.rpc("publish_consume_fetch_bytes", { p_user_id: userId, p_bytes: bytes });
  if (error) return { ok: false, error: publishError("TRANSIENT", channel, `fetch_budget: ${error.message}`) };
  if (data !== true) return { ok: false, error: publishError("DAILY_BYTES", channel, `fetch_budget_exceeded: ${bytes}`) };
  return { ok: true };
}
