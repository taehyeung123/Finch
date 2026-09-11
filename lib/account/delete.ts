import { createAdminClient } from "@/lib/supabase/admin";
import { collectPublicPaths, purgePublicPaths, type PublicPaths } from "@/lib/links/public-cache";

/**
 * 계정 완전 삭제 코어 — 탈퇴(설정)와 «동의 안 함» 이탈(동의 화면)이 **같은 루틴**을 쓴다.
 *
 * 두 벌로 두면 한쪽만 고쳐진다 — reference-thumbs 버킷 누락(2026-08-17)이 정확히
 * 그런 식으로 생겼던 종류의 사고다. 절차의 근거 주석은 원 출처인
 * app/(finch)/(app)/settings/profile/actions.ts 에서 옮겨 왔다.
 */

/*
  탈퇴 시 비우는 버킷 — **경로가 `<user.id>/...` 로 시작하는 것 전부**.
  ⚠️ 새 버킷에 사용자별 프리픽스로 파일을 쓰기 시작하면 여기 추가할 것.
     (reference-thumbs 의 `pool/` 프리픽스는 공용 풀이라 대상이 아니다)
*/
const USER_BUCKETS = ["cardnews", "brand-logos", "reference-thumbs", "link-assets"] as const;
/*
  publish-media(발행 사진·영상, 0093)는 따로 지운다 — 경로가 한 단계(`${uid}/${uuid}.ext`)라 위 루프처럼 항목마다
  하위 목록을 한 번 더 부를 필요가 없다(파일 수만큼 목록 호출이 붙는다). 원장(publish_uploads)의 정확한 경로 + 폴더 목록(원장에 없는 것까지).
  원장 행은 auth.users 삭제 cascade 로 함께 사라진다.
*/
const PUBLISH_MEDIA_BUCKET = "publish-media";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Storage list 는 한 번에 최대 1000개다 — 넘으면 조용히 잘려 파일이 남는다. 끝까지 판다. */
async function listAll(admin: Admin, bucket: string, prefix: string): Promise<string[]> {
  const names: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error || !data || data.length === 0) break;
    names.push(...data.map((d) => d.name));
    if (data.length < PAGE) break;
  }
  return names;
}

/**
 * 스토리지 정리 → 주소 무덤 기록 → auth.users 삭제.
 * 도메인 표는 전부 on delete cascade 라 이 한 방으로 함께 사라진다
 * (payment_orders 만 set null — 전자상거래법 보존 의무).
 * 반환 false = auth 삭제 자체가 실패(호출측이 오류로 다룬다). 부수 정리 실패는 진행한다.
 */
export async function purgeAndDeleteUser(admin: Admin, userId: string): Promise<boolean> {
  /* Storage 는 auth.users 에 FK 가 없어 계정을 지워도 파일이 그대로 남는다.
     사용자 삭제 **앞에** 지운다 — 뒤로 미루면 실패했을 때 파일 주인이 없어진다.
     실패해도 탈퇴 자체는 진행한다 — 파일이 남는 것보다 탈퇴가 막히는 게 더 나쁘다. */
  for (const bucket of USER_BUCKETS) {
    try {
      const paths: string[] = [];
      for (const entry of await listAll(admin, bucket, userId)) {
        /* list 는 한 단계만 본다. cardnews 는 user/batch/01.png 구조라 하위를 한 번 더 판다. */
        const inner = await listAll(admin, bucket, `${userId}/${entry}`);
        if (inner.length > 0) paths.push(...inner.map((c) => `${userId}/${entry}/${c}`));
        else paths.push(`${userId}/${entry}`);
      }
      // remove 는 한 번에 받는 개수에 상한이 있다 — 100개씩 끊어 보낸다.
      for (let i = 0; i < paths.length; i += 100) {
        await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      }
    } catch (e) {
      console.error(`[account-delete] ${bucket} 정리 실패:`, e);
    }
  }
  try {
    const paths = new Set<string>();
    const { data: uploads, error: upErr } = await admin.from("publish_uploads").select("path").eq("user_id", userId);
    if (upErr) console.error("[account-delete] 발행 업로드 원장 조회 실패:", upErr.message);
    for (const r of (uploads ?? []) as Array<{ path: string }>) if (r.path.startsWith(`${userId}/`)) paths.add(r.path);
    for (const name of await listAll(admin, PUBLISH_MEDIA_BUCKET, userId)) paths.add(`${userId}/${name}`);
    const list = [...paths];
    for (let i = 0; i < list.length; i += 100) {
      const { error } = await admin.storage.from(PUBLISH_MEDIA_BUCKET).remove(list.slice(i, i + 100));
      if (error) console.error("[account-delete] publish-media 삭제 실패:", error.message);
    }
  } catch (e) {
    console.error("[account-delete] publish-media 정리 실패:", e);
  }

  /* 공개 프로필 창고 — 지울 페이지들의 공개 주소(자식 서브 주소·무덤 안내 포함)를 **지우기 전에** 모아 둔다.
     cascade 가 행을 지우면 주소를 알 길이 없고, 창고에 굳은 화면은 최대 하루 동안 계속 나간다(2026-09-11).
     아래 무덤 기록이 옛 무덤의 page_id 를 바꾸기 전이어야 한다. */
  let publicPaths: PublicPaths | null = null;
  try {
    const { data: mine } = await admin.from("link_pages").select("id").eq("user_id", userId);
    const ids = ((mine ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length) publicPaths = await collectPublicPaths(ids, { structure: true });
  } catch (e) {
    console.error("[account-delete] 공개 주소 수집 실패:", e);
  }

  /* 주소 무덤 기록 — cascade 가 link_pages 를 지우면서 slug 가 즉시 풀리는 것을 막는다(90일 보류).
     멀티 페이지(0060) — 한 장만 묻으면 나머지 주소가 즉시 풀린다. 전부 묻는다. */
  try {
    const { data: lps } = await admin.from("link_pages").select("slug").eq("user_id", userId);
    const slugs = ((lps ?? []) as Array<{ slug: string }>).map((r) => r.slug).filter(Boolean);
    if (slugs.length) {
      const now = new Date().toISOString();
      const { error: holdErr } = await admin
        .from("link_slug_history")
        .upsert(
          slugs.map((slug) => ({ slug, page_id: null, owner_id: userId, released_at: now })),
          { onConflict: "slug" },
        );
      if (holdErr) console.error("[account-delete] 옛 주소 기록 실패:", holdErr.message);
    }
  } catch (e) {
    console.error("[account-delete] 옛 주소 기록 실패:", e);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[account-delete] auth 사용자 삭제 실패:", error.message);
    return false;
  }
  /* 지운 사람의 공개 프로필이 창고에서 계속 나가지 않게 — 탈퇴·동의 거부 두 호출처 모두 서버 액션이다 */
  if (publicPaths) purgePublicPaths(publicPaths);
  return true;
}
