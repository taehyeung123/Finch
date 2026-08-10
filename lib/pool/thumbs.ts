import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/*
  썸네일 캐시 — 공급사 CDN 이미지를 Storage 로 복사한다.

  왜 캐시하는가: 공급사 CDN URL 은 서명 만료가 있다. 수집 시점 URL 을 그대로 저장하면
  며칠 뒤 카드가 전부 깨진 이미지가 된다(기존 수집 경로에서 이미 겪은 문제).

  왜 전부 캐시하지 않는가: 소재 500만 건 × 80KB ≈ 400GB. 스토리지 요금이 공급사
  크레딧보다 커진다. 그래서 **히트 스코어 상위부터** 채운다 — 어차피 사용자가 보는 건
  상위 몇 %다. 아래쪽은 열람될 때 개별로 채운다(ensureThumb).

  이 파일은 공급사 크레딧을 쓰지 않는다. 나가는 건 대역폭·스토리지뿐이라
  crawl_budget 이 아니라 자체 상한(perRun)으로 통제한다.
*/

const BUCKET = "reference-thumbs";
const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT = 10_000;

export interface ThumbResult {
  ok: number;
  failed: number;
  skipped: number;
}

/** Storage 경로 → 공개 URL. 화면 코드가 경로를 URL 로 바꾸는 유일한 경로. */
export function thumbPublicUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function download(url: string): Promise<{ buf: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT), cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
    return { buf, type };
  } catch {
    return null;
  }
}

/**
 * 캐시 대기열을 히트 스코어 높은 순으로 처리한다.
 *
 * 별도 큐 테이블을 두지 않는다 — thumb_state='pending' 인 행 자체가 큐다.
 * 상태 컬럼 하나가 큐 역할을 하므로 큐와 실제 데이터가 어긋날 지점이 없다.
 */
export async function fillThumbs(perRun = 80): Promise<ThumbResult> {
  const db = createAdminClient();
  const out: ThumbResult = { ok: 0, failed: 0, skipped: 0 };
  if (!db) return out;

  const { data } = await db
    .from("creatives")
    .select("id, thumb_src")
    .eq("thumb_state", "pending")
    .not("thumb_src", "is", null)
    .order("heat_score", { ascending: false })
    .limit(perRun);

  const batch = (data ?? []).map((r) => ({ id: String(r.id), url: String(r.thumb_src) }));
  if (batch.length === 0) return out;

  // 8개씩 병렬 — 서버리스 한 회차 안에 끝나야 하고, 너무 벌리면 CDN 이 429 를 준다.
  for (let i = 0; i < batch.length; i += 8) {
    const chunk = batch.slice(i, i + 8);
    const results = await Promise.all(
      chunk.map(async (item) => {
        const got = await download(item.url);
        if (!got) return { id: item.id, path: null as string | null };
        const ext = got.type.includes("png") ? "png" : got.type.includes("webp") ? "webp" : "jpg";
        const path = `pool/${item.id}.${ext}`;
        const { error } = await db.storage
          .from(BUCKET)
          .upload(path, got.buf, { contentType: got.type, upsert: true });
        return { id: item.id, path: error ? null : path };
      }),
    );

    for (const r of results) {
      if (r.path) {
        // 성공하면 원본 URL 을 비운다 — 만료된 값이 DB 에 남아 있으면 언젠가 누가 쓴다.
        await db
          .from("creatives")
          .update({ thumb_path: r.path, thumb_state: "ok", thumb_src: null })
          .eq("id", r.id);
        out.ok += 1;
      } else {
        // failed 로 남긴다. 재시도 대상이지만 pending 보다 뒤로 밀린다 —
        // 만료된 URL 은 몇 번을 시도해도 안 되므로 신규를 먼저 처리하는 게 맞다.
        await db.from("creatives").update({ thumb_state: "failed" }).eq("id", r.id);
        out.failed += 1;
      }
    }
  }

  return out;
}
