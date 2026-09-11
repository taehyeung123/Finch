import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { PUBLISH_MEDIA_BUCKET, isOwnMediaPath, parseStoredMedia } from "@/lib/publish/media-core";
import { purgeUnattachedUploads } from "@/lib/publish/uploads";

/**
 * 발행 파일 정리 크론 — 매일 20:50 UTC(05:50 KST, 2026-09-11 영상 발행).
 *
 * storage-sweep 과 달리 **지운다** — 여기서 지우는 것은 참조가 정확히 알려진 것뿐이다:
 *   ① 영상 원본 — 발행 7일 뒤·취소 즉시(다음 실행)·실패 30일 뒤. 메타는 자기 사본을 갖는다.
 *      커버·사진은 남긴다(목록 썸네일). 지운 글은 media_purged_at 이 찍혀 다시 예약·발행이 막힌다.
 *   ② 글에 붙지 않은 업로드 — 올리고 24시간 안에 글이 안 된 것(작성 취소·창 닫기)
 *   ③ «지운 표시» 원장 — 지운 뒤에도 업로드 토큰이 2시간 살아 있어 같은 경로에 다시 올릴 수 있다. 3시간 지나면 한 번 더 지우고 행을 없앤다.
 * 전부 «먼저 차지하고(update … returning) 그다음 지운다» — 조회와 삭제 사이에 「지금 발행」·새 글 만들기가 끼어도
 * 쓰이는 파일을 지우지 않는다. 지우기 직전에 «아직 참조하는 글이 있나»를 한 번 더 본다(publish_paths_referenced) —
 * Storage 삭제는 되돌릴 수 없고 백업이 없다(storage-sweep 머리말).
 * 상태 안전: draft·scheduled·publishing·processing 글은 절대 건드리지 않는다.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

const TIME_BUDGET_MS = 270_000;
const DAY = 24 * 3600_000;
const PUBLISHED_KEEP_MS = 7 * DAY;
const FAILED_KEEP_MS = 30 * DAY;
const ORPHAN_GRACE_MS = DAY;
const TOMBSTONE_GRACE_MS = 3 * 3600_000;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("unauthorized", { status: 401 });
  const admin = createAdminClient();
  if (!admin) return new NextResponse("not_configured", { status: 503 });
  const started = Date.now();
  const left = () => TIME_BUDGET_MS - (Date.now() - started);
  let videosPurged = 0;
  let orphansRemoved = 0;
  let tombstonesCleared = 0;
  let failures = 0;

  /* ── ① 영상 원본 ── */
  const publishedBefore = new Date(Date.now() - PUBLISHED_KEEP_MS).toISOString();
  const failedBefore = new Date(Date.now() - FAILED_KEEP_MS).toISOString();
  /* 값은 큰따옴표로 감싼다 — 시각 문자열의 «.»·«:» 가 PostgREST 논리식 문법과 섞이지 않게 */
  const purgeable = `and(status.eq.published,published_at.lt."${publishedBefore}"),status.eq.canceled,and(status.eq.failed,updated_at.lt."${failedBefore}")`;
  const candidates = await admin
    .from("scheduled_posts")
    .select("id")
    .not("media", "is", null)
    .is("media_purged_at", null)
    /* 영상이 있는 글만 — 사진뿐인 글이 후보 200개를 영영 차지하지 않게(2026-09-11 점검) */
    .filter("media", "cs", JSON.stringify([{ kind: "video" }]))
    .or(purgeable)
    .order("updated_at", { ascending: true })
    .limit(200);
  if (candidates.error) {
    /* 조회 실패는 «정리할 것 없음»이 아니다 — 이번 회차 ①을 건너뛴다 */
    console.error("[cron:publish-media-sweep] 영상 후보 조회 실패:", candidates.error.message);
    failures++;
  } else {
    for (const c of (candidates.data ?? []) as Array<{ id: string }>) {
      if (left() < 30_000) break;
      /* 먼저 차지 — 조건을 다시 건다(그 사이 「다시 예약」 등으로 상태가 바뀌었으면 건드리지 않는다) */
      const claimedAt = new Date().toISOString();
      const claim = await admin
        .from("scheduled_posts")
        .update({ media_purged_at: claimedAt })
        .eq("id", c.id)
        .is("media_purged_at", null)
        .or(purgeable)
        .select("id, user_id, media");
      if (claim.error) {
        console.error("[cron:publish-media-sweep] 차지 실패:", c.id, claim.error.message);
        failures++;
        continue;
      }
      const row = (claim.data ?? [])[0] as { id: string; user_id: string; media: unknown } | undefined;
      if (!row) continue;
      const items = parseStoredMedia(row.media, row.user_id);
      const videoPaths = (items ?? []).filter((m) => m.kind === "video" && isOwnMediaPath(m.path, row.user_id, "video")).map((m) => m.path);
      if (!items) {
        /* 모양이 틀린 글 — 지울 경로를 확신할 수 없다. 표시만 남기고(다시 후보가 되지 않게) 사람에게 알린다 */
        console.error("[cron:publish-media-sweep] 미디어 모양 이상 — 파일은 그대로 두고 표시만:", row.id);
        continue;
      }
      if (videoPaths.length === 0) continue;
      const { error: rmErr } = await admin.storage.from(PUBLISH_MEDIA_BUCKET).remove(videoPaths);
      if (rmErr) {
        console.error("[cron:publish-media-sweep] 영상 삭제 실패(내일 다시):", row.id, rmErr.message);
        await admin.from("scheduled_posts").update({ media_purged_at: null }).eq("id", row.id).eq("media_purged_at", claimedAt);
        failures++;
        continue;
      }
      await admin.from("publish_uploads").update({ purged_at: claimedAt }).eq("user_id", row.user_id).in("path", videoPaths);
      videosPurged += videoPaths.length;
    }
  }

  /* 참조 대조 — 실패하면 null(삭제 단계 전체를 건너뛴다) */
  const referenced = async (paths: string[]): Promise<Set<string> | null> => {
    if (paths.length === 0) return new Set();
    const { data, error } = await admin.rpc("publish_paths_referenced", { p_paths: paths });
    if (error) {
      console.error("[cron:publish-media-sweep] 참조 대조 실패:", error.message);
      return null;
    }
    return new Set(((data ?? []) as unknown[]).map((r) => (typeof r === "string" ? r : String((r as Record<string, unknown>).publish_paths_referenced ?? ""))));
  };

  /* ── ② 글에 붙지 않은 업로드 ── */
  if (left() > 30_000) {
    const orphans = await admin
      .from("publish_uploads")
      .select("path, user_id")
      .is("post_id", null)
      .is("purged_at", null)
      .lt("created_at", new Date(Date.now() - ORPHAN_GRACE_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(1000);
    if (orphans.error) {
      console.error("[cron:publish-media-sweep] 고아 조회 실패:", orphans.error.message);
      failures++;
    } else {
      const rows = (orphans.data ?? []) as Array<{ path: string; user_id: string }>;
      const refs = await referenced(rows.map((r) => r.path));
      if (refs === null) {
        failures++;
      } else {
        const byUser = new Map<string, string[]>();
        for (const r of rows) {
          if (refs.has(r.path)) {
            console.error("[cron:publish-media-sweep] 붙지 않은 업로드인데 글이 참조함 — 건드리지 않음:", r.path);
            continue;
          }
          const list = byUser.get(r.user_id) ?? [];
          list.push(r.path);
          byUser.set(r.user_id, list);
        }
        for (const [userId, paths] of byUser) {
          if (left() < 20_000) break;
          const removed = await purgeUnattachedUploads(admin, userId, paths);
          orphansRemoved += removed.length;
          if (removed.length > 0) {
            /* 24시간이 지난 업로드는 토큰도 만료됐다 — 표시 행을 남길 이유가 없다 */
            const { error } = await admin.from("publish_uploads").delete().eq("user_id", userId).in("path", removed);
            if (error) console.error("[cron:publish-media-sweep] 원장 정리 실패:", error.message);
          }
          if (removed.length < paths.length) failures++;
        }
      }
    }
  }

  /* ── ③ 지운 표시 원장 — 토큰 수명이 지난 뒤 한 번 더 지우고 행을 없앤다 ── */
  if (left() > 20_000) {
    const tombs = await admin
      .from("publish_uploads")
      .select("path, user_id")
      .is("post_id", null)
      .not("purged_at", "is", null)
      .lt("created_at", new Date(Date.now() - TOMBSTONE_GRACE_MS).toISOString())
      .limit(1000);
    if (tombs.error) {
      console.error("[cron:publish-media-sweep] 표시 원장 조회 실패:", tombs.error.message);
      failures++;
    } else {
      const rows = ((tombs.data ?? []) as Array<{ path: string; user_id: string }>).filter((r) => isOwnMediaPath(r.path, r.user_id));
      const refs = await referenced(rows.map((r) => r.path));
      if (refs === null) {
        failures++;
      } else {
        const paths = rows.filter((r) => !refs.has(r.path)).map((r) => r.path);
        for (let i = 0; i < paths.length && left() > 10_000; i += 100) {
          const chunk = paths.slice(i, i + 100);
          const { error: rmErr } = await admin.storage.from(PUBLISH_MEDIA_BUCKET).remove(chunk);
          if (rmErr) {
            console.error("[cron:publish-media-sweep] 표시 원장 객체 삭제 실패:", rmErr.message);
            failures++;
            continue;
          }
          const { error } = await admin.from("publish_uploads").delete().in("path", chunk).is("post_id", null).not("purged_at", "is", null);
          if (error) console.error("[cron:publish-media-sweep] 표시 원장 행 삭제 실패:", error.message);
          else tombstonesCleared += chunk.length;
        }
      }
    }
  }

  /* 전송 예산 기록은 일주일이면 충분하다 */
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  await admin.from("publish_fetch_usage").delete().lt("day", weekAgo);

  return NextResponse.json({ ok: true, videosPurged, orphansRemoved, tombstonesCleared, failures });
}
