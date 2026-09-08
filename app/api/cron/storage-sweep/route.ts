import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";

/**
 * 고아 파일 **관찰** 크론 (매일 20:40 UTC = 05:40 KST).
 *
 * ⚠️ **이 라우트에는 삭제 코드가 없다.** 후보를 기록하기만 한다.
 *
 * 왜 이렇게 하나 (2026-09-08 보안 감사): 「제거」·「삭제」를 눌러도 Storage 객체가 남아
 * 이미 퍼진 공개 주소로 계속 받아진다. 그런데 프로필 링크 쪽은 즉시 삭제를 붙일 수 없다 —
 * 블록 복제가 같은 이미지 주소를 공유하고, 옛 주소가 published_snapshot 에도 굳어 있다.
 * 그래서 «참조 전수 조사» 가 필요한데, **Storage 삭제는 되돌릴 수 없고 백업이 없다.**
 * 판정이 한 군데만 틀려도 고객이 지금 쓰는 사진이 사라진다.
 *
 * 그래서 순서를 나눴다:
 *   1단계(지금)  후보만 기록 — 이 파일에 remove() 호출이 없다
 *   2단계(2주 뒤) storage_orphan_candidates 를 눈으로 확인
 *   3단계        확인이 끝나면 삭제를 켠다(별도 작업. 환경변수 하나로 켜지게 만들지 **않았다** —
 *               그러면 검토 없이 켜질 수 있다. 그때 코드를 다시 짠다.)
 *
 * ── 참조 판정을 «필드 목록»으로 하지 않는 이유 ────────────────────────────
 * 이미지 주소는 link_blocks.data 안, published_snapshot 안, theme_custom 의 bgImage·logoImage 등
 * **여러 곳에 흩어져** 있다. 필드를 열거하면 하나 빠뜨리는 순간 살아 있는 파일이 후보가 된다.
 * 그래서 그 사용자의 행 전체를 JSON 문자열로 만들어 **경로가 어디든 등장하는지** 본다.
 * 필드가 늘어나도 저절로 따라간다 — 이 판정에서는 «못 보는 것»이 곧 사고다.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

/** 한 번에 훑는 사용자 수 — 밀린 첫 며칠은 여러 밤에 걸쳐 천천히 돈다 */
const USERS_PER_RUN = 200;
/** 이 시간 안에 만들어진 객체는 건드리지 않는다 — «올리고 아직 저장 안 한» 것을 살려 둔다 */
const GRACE_MS = 24 * 60 * 60 * 1000;
/** 한 사용자에게서 한 번에 훑는 객체 수 상한(페이지 크기 × 페이지 수) */
const LIST_PAGE = 100;
const MAX_PAGES = 20;

type Admin = SupabaseClient;

interface StorageEntry {
  name: string;
  created_at?: string | null;
  metadata?: { size?: number } | null;
}

/** 한 폴더의 객체를 끝까지 나열한다(한 단계). 실패는 null — «비었다»와 구분한다. */
async function listFolder(admin: Admin, bucket: string, prefix: string): Promise<StorageEntry[] | null> {
  const out: StorageEntry[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: LIST_PAGE,
      offset: page * LIST_PAGE,
    });
    if (error) return null;
    if (!data || data.length === 0) break;
    out.push(...(data as StorageEntry[]));
    if (data.length < LIST_PAGE) break;
  }
  return out;
}

/**
 * 사용자 폴더 아래의 객체 경로를 모은다(한 단계 더 판다 — cardnews 는 `user/batch/01.png` 구조다).
 * ⚠️ 실패하면 **null** 을 돌려준다. 실패를 «파일 없음»으로 다루면 그 사용자는 조용히 건너뛰는 대신
 * «고아 0건»으로 기록돼, 나중에 판정이 맞았다고 착각하게 된다(실패는 «없음»이 아니다).
 */
async function listUserObjects(
  admin: Admin,
  bucket: string,
  userId: string,
): Promise<{ path: string; size: number | null; createdAt: string | null }[] | null> {
  const top = await listFolder(admin, bucket, userId);
  if (top === null) return null;
  const out: { path: string; size: number | null; createdAt: string | null }[] = [];
  for (const entry of top) {
    /* Supabase list 는 «폴더»를 metadata 없는 항목으로 준다 — 그때 한 단계 더 판다 */
    if (entry.metadata && typeof entry.metadata.size === "number") {
      out.push({
        path: `${userId}/${entry.name}`,
        size: entry.metadata.size,
        createdAt: entry.created_at ?? null,
      });
      continue;
    }
    const inner = await listFolder(admin, bucket, `${userId}/${entry.name}`);
    if (inner === null) return null;
    for (const child of inner) {
      out.push({
        path: `${userId}/${entry.name}/${child.name}`,
        size: child.metadata?.size ?? null,
        createdAt: child.created_at ?? null,
      });
    }
  }
  return out;
}

/**
 * 이 사용자의 행 전체를 문자열 하나로 — 여기에 경로가 등장하면 «참조 있음»이다.
 * 실패하면 null(그 사용자는 이번 회차를 통째로 건너뛴다).
 */
async function referenceBlob(admin: Admin, userId: string): Promise<string | null> {
  const pages = await admin.from("link_pages").select("*").eq("user_id", userId);
  if (pages.error) return null;
  const pageIds = (pages.data ?? []).map((p) => (p as { id: string }).id);

  let blocksText = "";
  if (pageIds.length > 0) {
    const blocks = await admin.from("link_blocks").select("*").in("page_id", pageIds);
    if (blocks.error) return null;
    blocksText = JSON.stringify(blocks.data ?? []);
  }

  const posts = await admin.from("scheduled_posts").select("*").eq("user_id", userId);
  if (posts.error) return null;

  /* 브랜드 킷(brand-logos)은 교체·삭제 때 이미 옛 객체를 지운다(studio/brand-kit-actions.ts) —
     그래도 참조 원본으로 함께 넣어 둔다. 표가 없는 DB 도 있을 수 있으니 실패는 무시한다. */
  const brand = await admin.from("brand_kits").select("*").eq("user_id", userId);

  return [
    JSON.stringify(pages.data ?? []),
    blocksText,
    JSON.stringify(posts.data ?? []),
    brand.error ? "" : JSON.stringify(brand.data ?? []),
  ].join("\n");
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }

  /* 가장 오래 안 훑은 사용자부터. 커서 행이 없는 사용자는 '-infinity' 로 먼저 잡히도록
     users_profile 을 기준으로 훑되, 이미 훑은 사람은 last_swept_at 순으로 뒤로 밀린다. */
  const { data: profiles, error: profErr } = await admin.from("users_profile").select("id").limit(2000);
  if (profErr) {
    console.error("[cron:storage-sweep] 사용자 조회 실패:", profErr.message);
    return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
  }
  const allIds = (profiles ?? []).map((p) => (p as { id: string }).id);

  const { data: states } = await admin
    .from("storage_sweep_state")
    .select("user_id, last_swept_at")
    .order("last_swept_at", { ascending: true });
  const sweptAt = new Map<string, string>();
  for (const s of states ?? []) sweptAt.set((s as { user_id: string }).user_id, (s as { last_swept_at: string }).last_swept_at);

  const due = allIds
    .map((id) => ({ id, at: sweptAt.get(id) ?? "" }))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, USERS_PER_RUN);

  const cutoff = Date.now() - GRACE_MS;
  let scanned = 0;
  let objects = 0;
  let candidates = 0;
  let skipped = 0;

  for (const { id: userId } of due) {
    const blob = await referenceBlob(admin, userId);
    if (blob === null) {
      /* 참조를 못 읽었다 — 이 사용자는 통째로 건너뛴다. «참조 없음»으로 오해하면 안 된다. */
      skipped++;
      continue;
    }

    let userObjects = 0;
    let userOrphans = 0;
    let failed = false;

    for (const bucket of ["link-assets", "cardnews"] as const) {
      const list = await listUserObjects(admin, bucket, userId);
      if (list === null) {
        failed = true;
        break;
      }
      userObjects += list.length;
      for (const obj of list) {
        /* 방금 올린 것은 건드리지 않는다 — 저장 전이라 아직 어디서도 참조되지 않는다 */
        const created = obj.createdAt ? new Date(obj.createdAt).getTime() : NaN;
        if (!Number.isFinite(created) || created > cutoff) continue;

        const referenced = blob.includes(obj.path);
        if (referenced) {
          /* 참조가 보이면 후보에서 뺀다 — 저장 도중 잠깐 안 보였던 경우를 되돌린다 */
          await admin.from("storage_orphan_candidates").delete().eq("bucket", bucket).eq("path", obj.path);
          continue;
        }
        userOrphans++;
        const { data: existing } = await admin
          .from("storage_orphan_candidates")
          .select("strikes")
          .eq("bucket", bucket)
          .eq("path", obj.path)
          .maybeSingle();
        const strikes = ((existing as { strikes?: number } | null)?.strikes ?? 0) + 1;
        const { error: upErr } = await admin.from("storage_orphan_candidates").upsert(
          {
            bucket,
            path: obj.path,
            user_id: userId,
            size_bytes: obj.size,
            object_created_at: obj.createdAt,
            last_seen_at: new Date().toISOString(),
            strikes,
          },
          { onConflict: "bucket,path" },
        );
        if (upErr) console.error("[cron:storage-sweep] 후보 기록 실패:", bucket, upErr.message);
      }
    }

    if (failed) {
      skipped++;
      continue;
    }

    scanned++;
    objects += userObjects;
    candidates += userOrphans;
    await admin.from("storage_sweep_state").upsert(
      {
        user_id: userId,
        last_swept_at: new Date().toISOString(),
        last_objects: userObjects,
        last_orphans: userOrphans,
      },
      { onConflict: "user_id" },
    );
  }

  /* deleted 를 **항상 0 으로** 돌려준다 — 이 라우트가 무엇을 하는지 응답만 봐도 알 수 있게.
     삭제를 켜는 것은 코드를 다시 짜는 일이지 값 하나 바꾸는 일이 아니다. */
  return NextResponse.json({ ok: true, mode: "observe", scanned, skipped, objects, candidates, deleted: 0 });
}
