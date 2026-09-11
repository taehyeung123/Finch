/* service_role 로 비공개 버킷 업로드 토큰을 만들고 객체를 지운다 — 서버 전용 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLISH_MAX_IMAGE_BYTES,
  PUBLISH_MAX_VIDEO_BYTES,
  type PublishMime,
  type PublishUploadKind,
} from "@/lib/publish-rules";
import { PUBLISH_MEDIA_BUCKET, isOwnMediaPath, parseStoredMedia } from "@/lib/publish/media-core";
import { sniffContainer } from "@/lib/publish/sniff";
import { publishDbErrorKey, publishDbErrorText } from "@/lib/publish/db-errors";
import type { FinalizeResult, PublishUploadRequest, PublishUploadTicket } from "@/lib/publish/upload-types";

/*
  발행 업로드 — 브라우저가 Storage 로 **직접** 올린다 (2026-09-11 영상 발행).

  예전엔 사진을 base64 로 서버 액션 본문에 실었다. Vercel 은 요청 본문 4.5MB 에서 413 을 내서 컴포저가 합계 3MB 에서 막았고,
  영상은 아예 불가능했다. 이제 서버는 경로와 **서명 업로드 토큰**만 만들고(이 파일), 바이트는 브라우저가 PUT 으로 보낸다.

  순서: 발급(issueUploadTickets) → 브라우저 PUT → 확인(finalizeUploads: 크기·형식·첫 바이트) → 글에 붙이기(create_publish_post).
  경로는 서버가 `${uid}/${uuid}.${ext}` 로만 만든다 — 한 단계라 계정 삭제·고아 점검이 그대로 훑는다.
  모든 쿼리에 .eq("user_id", …) — admin 은 RLS 를 우회하므로 **필터가 곧 권한**이다.
  ⚠️ links/actions.ts 의 `admin ?? createClient()` 폴백을 베끼지 말 것 — admin 이 없으면 닫는다(CLAUDE.md).
*/

export type { PublishUploadRequest, PublishUploadTicket, FinalizeResult };

const MAX_FILES_PER_CALL = 40;
const TOKEN_LIFETIME_MS = 2 * 3600_000 - 5 * 60_000;

function planOne(userId: string, f: PublishUploadRequest): { ok: true; path: string; mime: PublishMime; maxBytes: number } | { ok: false; error: string } {
  if (!f || (f.kind !== "image" && f.kind !== "video" && f.kind !== "cover")) return { ok: false, error: "올릴 수 없는 파일이에요." };
  const size = Number(f.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "빈 파일은 올릴 수 없어요." };
  if (f.kind === "video") {
    const ext = String(f.name ?? "").toLowerCase().split(".").pop() ?? "";
    const mime: PublishMime | null = ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : null;
    if (!mime) return { ok: false, error: "MP4·MOV 영상만 올릴 수 있어요." };
    if (size > PUBLISH_MAX_VIDEO_BYTES) return { ok: false, error: "영상은 300MB까지 올릴 수 있어요." };
    return { ok: true, path: `${userId}/${crypto.randomUUID()}.${ext}`, mime, maxBytes: PUBLISH_MAX_VIDEO_BYTES };
  }
  if (size > PUBLISH_MAX_IMAGE_BYTES) return { ok: false, error: "사진은 8MB까지 올릴 수 있어요." };
  return { ok: true, path: `${userId}/${crypto.randomUUID()}.jpg`, mime: "image/jpeg", maxBytes: PUBLISH_MAX_IMAGE_BYTES };
}

/**
 * 업로드 자리 발급 — 상한은 DB 함수 하나가 원자적으로 본다(claim_publish_uploads). 요청 순서대로 표를 돌려준다.
 * 파일별 문제(형식·크기)는 그 표만 ok:false, 상한 초과는 묶음 전체가 실패한다.
 */
export async function issueUploadTickets(
  admin: SupabaseClient,
  userId: string,
  files: PublishUploadRequest[],
): Promise<{ ok: true; tickets: PublishUploadTicket[] } | { ok: false; error: string; retryable: boolean }> {
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "올릴 파일을 골라 주세요.", retryable: false };
  if (files.length > MAX_FILES_PER_CALL) return { ok: false, error: "한 번에 너무 많은 파일을 올리려고 해요.", retryable: false };

  const plans = files.map((f) => planOne(userId, f));
  const claimable = plans.flatMap((p, i) => (p.ok ? [{ path: p.path, kind: files[i].kind, mime: p.mime, bytes: Math.ceil(Number(files[i].size)) }] : []));
  if (claimable.length > 0) {
    const { error } = await admin.rpc("claim_publish_uploads", { p_user_id: userId, p_items: claimable });
    if (error) {
      const key = publishDbErrorKey(error);
      if (key === "service_full") console.error("[publish:upload] 서비스 전체 보관 상한 도달 — 운영 확인 필요");
      else if (!key) console.error("[publish:upload] 자리 발급 실패:", error.message);
      return {
        ok: false,
        error: publishDbErrorText(error) ?? "업로드를 준비하지 못했어요 — 잠시 후 다시 시도해 주세요.",
        retryable: !key || key === "too_many_pending" || key === "service_full",
      };
    }
  }

  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString();
  const tickets = await Promise.all(
    plans.map(async (p): Promise<PublishUploadTicket> => {
      if (!p.ok) return p;
      const { data, error } = await admin.storage.from(PUBLISH_MEDIA_BUCKET).createSignedUploadUrl(p.path);
      if (error || !data) {
        console.error("[publish:upload] 서명 업로드 URL 실패:", error?.message ?? "no data");
        /* 자리는 치운다(토큰이 안 나갔으니 객체도 없다) — 상한을 헛되이 먹지 않게 */
        await admin.from("publish_uploads").update({ purged_at: new Date().toISOString() }).eq("user_id", userId).eq("path", p.path);
        return { ok: false, error: "업로드를 준비하지 못했어요 — 다시 올려 주세요." };
      }
      return { ok: true, path: p.path, uploadUrl: data.signedUrl, token: data.token, contentType: p.mime, maxBytes: p.maxBytes, expiresAt };
    }),
  );
  return { ok: true, tickets };
}

function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
}

/**
 * 첫 64바이트만 읽는다 — storage-js download() 는 범위를 못 줘서 300MB 를 통째로 함수에 올린다.
 * 우리 Supabase 오리진의 60초 서명 URL 에 Range 요청(남의 URL 을 여는 게 아니다 — 오리진을 확인한다).
 * 반환 null = 읽지 못했다(일시 오류 — 지우지 않는다).
 */
async function readHead(admin: SupabaseClient, path: string): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from(PUBLISH_MEDIA_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return null;
  const origin = supabaseOrigin();
  try {
    if (!origin || new URL(data.signedUrl).origin !== origin) return null;
    const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-63" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (res.status !== 206 && res.status !== 200) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    /* 200(범위 무시)이어도 앞 64바이트만 읽고 끊는다 */
    const chunks: Uint8Array[] = [];
    let got = 0;
    while (got < 64) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      got += value.length;
    }
    await reader.cancel().catch(() => {});
    const out = new Uint8Array(Math.min(64, got));
    let at = 0;
    for (const c of chunks) {
      const take = Math.min(c.length, out.length - at);
      out.set(c.subarray(0, take), at);
      at += take;
      if (at >= out.length) break;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 원장에서 자리를 먼저 차지(purged_at)한 뒤 객체를 지운다 — 차지하지 못한 경로(이미 글에 붙었거나 지운 것)는 건드리지 않는다.
 * 지우기가 실패하면 차지를 되돌린다(정리 크론이 다시 시도한다). 반환: 지운 경로.
 */
export async function purgeUnattachedUploads(admin: SupabaseClient, userId: string, paths: string[]): Promise<string[]> {
  const own = paths.filter((p) => isOwnMediaPath(p, userId));
  if (own.length === 0) return [];
  const { data, error } = await admin
    .from("publish_uploads")
    .update({ purged_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("path", own)
    .is("post_id", null)
    .is("purged_at", null)
    .select("path");
  if (error) {
    console.error("[publish:upload] 정리 차지 실패:", error.message);
    return [];
  }
  const claimed = ((data ?? []) as Array<{ path: string }>).map((r) => r.path);
  if (claimed.length === 0) return [];
  const removed: string[] = [];
  for (let i = 0; i < claimed.length; i += 100) {
    const chunk = claimed.slice(i, i + 100);
    const { error: rmErr } = await admin.storage.from(PUBLISH_MEDIA_BUCKET).remove(chunk);
    if (rmErr) {
      console.error("[publish:upload] 객체 삭제 실패(정리 크론이 다시 본다):", rmErr.message);
      await admin.from("publish_uploads").update({ purged_at: null }).eq("user_id", userId).in("path", chunk);
    } else {
      removed.push(...chunk);
    }
  }
  return removed;
}

/**
 * 올린 뒤 확인 — 서명 URL 은 요청한 크기만 보고 내줬다. 실제 크기·형식·첫 바이트를 보고 틀리면 지운다.
 * 일시 오류(정보·범위 요청 실패)는 지우지 않고 retryable 로 돌려준다 — «확인 못 함»을 «불량»으로 단정하지 않는다.
 */
export async function finalizeUploads(admin: SupabaseClient, userId: string, paths: string[]): Promise<FinalizeResult[]> {
  const list = Array.isArray(paths) ? paths.slice(0, MAX_FILES_PER_CALL) : [];
  const own = list.filter((p) => isOwnMediaPath(p, userId));
  const rowsByPath = new Map<string, { kind: PublishUploadKind; mime: string; declared_bytes: number; actual_bytes: number | null; finalized_at: string | null; purged_at: string | null }>();
  if (own.length > 0) {
    const { data, error } = await admin
      .from("publish_uploads")
      .select("path, kind, mime, declared_bytes, actual_bytes, finalized_at, purged_at")
      .eq("user_id", userId)
      .in("path", own);
    if (error) {
      console.error("[publish:upload] 원장 조회 실패:", error.message);
      return list.map((path) => ({ path, ok: false, error: "확인하지 못했어요 — 잠시 후 다시 시도해 주세요.", retryable: true }));
    }
    for (const r of (data ?? []) as Array<{ path: string } & Parameters<typeof rowsByPath.set>[1]>) rowsByPath.set(r.path, r);
  }

  const one = async (path: string): Promise<FinalizeResult> => {
    const row = rowsByPath.get(path);
    if (!row) return { path, ok: false, error: "올바르지 않은 파일이에요.", retryable: false };
    if (row.purged_at) return { path, ok: false, error: "이미 지운 파일이에요 — 다시 올려 주세요.", retryable: false };
    if (row.finalized_at) return { path, ok: true, bytes: Number(row.actual_bytes ?? row.declared_bytes) };
    const info = await admin.storage.from(PUBLISH_MEDIA_BUCKET).info(path);
    if (info.error || !info.data) {
      const notFound = /not.?found|404|does not exist/i.test(info.error?.message ?? "");
      return {
        path,
        ok: false,
        error: notFound ? "파일이 올라가지 않았어요 — 다시 올려 주세요." : "확인하지 못했어요 — 잠시 후 다시 시도해 주세요.",
        retryable: true,
      };
    }
    const size = Number(info.data.size ?? 0);
    const contentType = String(info.data.contentType ?? "");
    const max = row.kind === "video" ? PUBLISH_MAX_VIDEO_BYTES : PUBLISH_MAX_IMAGE_BYTES;
    let bad: string | null = null;
    if (size <= 0) bad = "빈 파일이에요.";
    else if (size > max) bad = row.kind === "video" ? "영상은 300MB까지 올릴 수 있어요." : "사진은 8MB까지 올릴 수 있어요.";
    else if (size > Number(row.declared_bytes)) bad = "올리려던 파일과 크기가 달라요 — 다시 올려 주세요.";
    else if (contentType !== row.mime) bad = "파일 형식이 맞지 않아요 — 다시 올려 주세요.";
    if (!bad) {
      const head = await readHead(admin, path);
      if (!head) return { path, ok: false, error: "확인하지 못했어요 — 잠시 후 다시 시도해 주세요.", retryable: true };
      const sniffed = sniffContainer(head);
      if ((row.kind === "video" && sniffed !== "iso-bmff") || (row.kind !== "video" && sniffed !== "jpeg")) {
        bad = row.kind === "video" ? "MP4·MOV 영상이 아니에요." : "JPG 사진이 아니에요.";
      }
    }
    if (bad) {
      await purgeUnattachedUploads(admin, userId, [path]);
      return { path, ok: false, error: bad, retryable: false };
    }
    /* 정확히 1행이 바뀌어야 확인이다 — 그 사이 «버리기»가 먼저 지웠으면 0행이다 */
    const { data: done, error: upErr } = await admin
      .from("publish_uploads")
      .update({ finalized_at: new Date().toISOString(), actual_bytes: size })
      .eq("user_id", userId)
      .eq("path", path)
      .is("purged_at", null)
      .is("finalized_at", null)
      .select("path");
    if (upErr) {
      console.error("[publish:upload] 확인 기록 실패:", upErr.message);
      return { path, ok: false, error: "확인하지 못했어요 — 잠시 후 다시 시도해 주세요.", retryable: true };
    }
    if (!done || done.length !== 1) return { path, ok: false, error: "이미 지운 파일이에요 — 다시 올려 주세요.", retryable: false };
    return { path, ok: true, bytes: size };
  };

  /* 파일마다 Storage 왕복이 셋이다 — 넷씩 나란히(서버 액션은 클라이언트마다 차례로 돌아서, 확인이 길면 다른 액션이 밀린다) */
  const out: FinalizeResult[] = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await one(list[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker));
  return out;
}

/** 글에서 지울 파일 경로 — 항목과 커버 전부(이 사용자 폴더 것만) */
export function mediaPathsOf(media: unknown, userId: string): string[] {
  const items = parseStoredMedia(media, userId);
  if (!items) return [];
  return items.flatMap((m) => (m.cover_path ? [m.path, m.cover_path] : [m.path]));
}

/**
 * 지운 글의 파일 정리 — 행이 지워지면 publish_uploads.post_id 가 null 이 된다(FK set null) → 차지 → 삭제.
 * 원장 행은 «지운 표시»(purged_at)로 남긴다 — 업로드 토큰이 아직 살아 있으면(발급 2시간) 같은 경로에 다시 올릴 수 있어서,
 * 정리 크론이 토큰 수명이 지난 뒤 한 번 더 지우고 행을 없앤다. 실패해도 원장이 남아 크론이 치운다.
 */
export async function cleanupDeletedPostMedia(admin: SupabaseClient, userId: string, media: unknown): Promise<number> {
  const paths = mediaPathsOf(media, userId);
  if (paths.length === 0) return 0;
  return (await purgeUnattachedUploads(admin, userId, paths)).length;
}
