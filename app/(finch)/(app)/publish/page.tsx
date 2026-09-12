import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/section-header";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { LIST_POST_COLUMNS, toListItem, type ListPostRow } from "@/lib/publish/list-item";
import { postAccountView, type CurrentAccount } from "@/lib/publish/account-core";
import { signPostThumbs } from "@/lib/publish/thumbs";
import { accounts as sampleAccounts, scheduledPosts as demoScheduledPosts } from "@/lib/data";
import type { ComposerChannel } from "./_components/post-composer";
import { PublishList, type ScheduledPost } from "./_components/publish-list";

export const metadata: Metadata = {
  title: "발행",
  robots: { index: false, follow: false },
};

/* 「지금 발행」 서버 액션이 이 페이지에서 불린다 — 메타가 캐러셀 이미지를 처리하는 데 최대 1분 남짓 걸린다.
   이 값이 없으면 플랫폼 기본값에 걸려 액션이 도중에 죽고, 그러면 실패 처리가 실행되지 않아
   행이 'publishing' 으로 굳는다(크론이 30분 뒤 회수하지만 사용자는 그동안 결과를 모른다). */
export const maxDuration = 120;

/*
  발행 — 2026-08-15 IA 개편으로 신설.

  예약 발행 자체는 원래 있었다(0010_scheduled_posts + /api/studio/schedule +
  크론 publish-scheduled — 2026-09-09 까지는 하루 1회, 지금은 5분마다). 문제는 **진입점**이었다:
   · 스튜디오 화면 하단에 패널 한 줄로 붙어 있어 메뉴에 존재하지 않았고
   · 그 패널이 예약 0건이면 null 을 반환해 **화면에서 통째로 사라졌다**.
  즉 한 번도 예약해본 적 없는 사람에게는 없는 기능이었다.

  목록은 **서버에서 조회한다**. 앞서는 클라이언트가 마운트 후 별도 API 를 불렀는데
  (그 엔드포인트는 이제 없다), 그러면 첫 페인트가 비어 있다가 채워지고(깜빡임)
  effect 안 setState 로 캐스케이딩 렌더도 생긴다. 인증·RLS 는 서버에서 그대로 걸린다.

  **초안과 예약을 따로 조회한다.** 한 쿼리로 최신순 200건을 뽑으면, 초안이 쌓였을 때
  (초안의 scheduled_at 은 "만든 시각"이다) 상위 200위를 초안이 채워 진짜 미래 예약이
  화면에서 사라진다. 성격이 다른 목록은 쿼리도 나눈다.

  ⚠️ **발행이 되는 채널은 인스타그램·스레드 둘이다**(lib/meta/instagram-publish.ts,
  threads-publish.ts). 틱톡은 발행 API 자체가 코드에 없다. 화면이 "발행"이라고만 하면
  다채널 예약처럼 읽히므로 헤더에 명시한다 — 없는 기능을 있는 것처럼 두지 않는다.
*/
/** 최신순 절삭 한도 — 넘치면 화면이 조용히 거짓말하지 않도록 truncated 로 알린다 */
const PAGE_LIMIT = 200;

/** 연결된 계정 — 연결 스트립·작성기(channels)와 목록의 계정 칩(current)이 같은 조회 한 번을 쓴다 */
interface Accounts {
  /** null = 조회 실패 */
  channels: ComposerChannel[] | null;
  /** 채널 → 지금 연결된 계정(connected=true). null = 조회 실패(모름 — 목록은 «이전 계정»이라고 단정하지 않는다) */
  current: Map<string, CurrentAccount> | null;
}

/**
 * 목록 한 줄의 계정 칩(2026-09-12 계정 전환) — 글의 대상 계정(0094)을 지금 연결된 계정과 대조해 «@아이디» 또는
 * «@옛 · 이전 계정»을 정한다(규칙: lib/publish/account-core.ts postAccountView). 계정을 바꾼 뒤에도 옛 계정의 글이
 * 새 계정 것처럼 섞여 보이지 않게 한다.
 */
async function loadScheduled(accountsP: Promise<Accounts>): Promise<{ items: ScheduledPost[]; truncated: boolean; failed: boolean }> {
  /* isDemoMode + getAuthUser — 이 배치의 다른 화면들과 같은 조합이다.
     · isSupabaseConfigured 만 보면 NEXT_PUBLIC_DEMO_MODE(프로젝트가 죽었을 때의
       탈출구)를 못 잡아, 죽은 DB 에 쿼리를 던지고 렌더가 통째로 깨진다.
     · createClient().auth.getUser() 를 직접 부르면 레이아웃 가드와 합쳐 Auth 서버를
       요청당 2회 왕복한다(lib/supabase/server.ts 가 측정해서 고친 패턴). */
  if (isDemoMode()) return { items: demoScheduledPosts as ScheduledPost[], truncated: false, failed: false };
  const user = await getAuthUser();
  if (!user) return { items: [], truncated: false, failed: false };
  const supabase = await createClient();

  /* 캘린더가 생기면서 조회 범위를 넓혔다. 20건 오름차순이면 **과거만 20건** 나와서
     달력에 이번 달이 통째로 비어 보인다(가장 오래된 20건이 먼저 잡힌다).
     최신순 200건이면 앞뒤 몇 달은 확실히 덮는다. 그보다 오래된 발행 이력을 달력에서
     찾을 일은 없다 — 성과는 성과 분석이 본다. */
  const [sched, drafts] = await Promise.all([
    supabase
      .from("scheduled_posts")
      .select(LIST_POST_COLUMNS)
      .neq("status", "draft")
      .order("scheduled_at", { ascending: false })
      .limit(PAGE_LIMIT),
    supabase
      .from("scheduled_posts")
      .select(LIST_POST_COLUMNS)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  /* 예전엔 둘 중 하나만 실패해도 **둘 다 버리고** 빈 배열을 돌려줬다. 그러면 화면은
     「아직 예약이 없어요」라고 단정한다 — 예약해 둔 사람이 그걸 보면 다시 예약하거나,
     발행이 통째로 날아간 줄 안다. 실패는 «없음»이 아니다(lib/data/internal.ts 규칙).
     또 한쪽만 죽었을 때 살아 있는 쪽까지 버릴 이유도 없다 — 따로 판단한다. */
  if (sched.error) console.error("[publish] 예약 조회 실패:", sched.error.message);
  if (drafts.error) console.error("[publish] 초안 조회 실패:", drafts.error.message);
  const rows = [...((sched.data ?? []) as unknown as ListPostRow[]), ...((drafts.data ?? []) as unknown as ListPostRow[])];
  /* 썸네일 — 비공개 버킷(publish-media)은 서명 URL 을 한 번에 묶어 만든다. 실패하면 아이콘(표시용일 뿐이다) */
  const [thumbs, { current }] = await Promise.all([signPostThumbs(createAdminClient(), rows, user.id), accountsP]);
  const now = Date.now();
  const items = rows.map((r) => {
    /* current 가 null(조회 실패)이면 undefined 를 넘긴다 — «연결 없음»(null)과 «모름»(undefined)은 다르다 */
    const acc = current === null ? undefined : (current.get(r.channel ?? "instagram") ?? null);
    return toListItem(r, thumbs.get(r.id) ?? null, now, postAccountView(r, acc));
  });
  return {
    items,
    truncated: (sched.data ?? []).length >= PAGE_LIMIT,
    failed: !!sched.error || !!drafts.error,
  };
}

/**
 * 채널 연결 스트립 데이터 — 데모: 샘플 계정, 실제: connected_accounts.
 * ⚠️ **null 은 «조회 실패»다.** 예전엔 error 를 아예 안 받아서 실패가 빈 배열이 됐고, 작성기가 그걸
 * «연동된 계정이 없어요»로 읽어 폼 대신 관문을 띄웠다 — 잘 쓰던 사람이 예약 발행을 못 하고 연결이 끊긴 줄 알고
 * 재연동하러 갔다. 같은 파일의 예약 목록 조회는 이미 실패를 화면까지 나르고 있었다(2026-09-07 감사).
 */
async function loadAccounts(): Promise<Accounts> {
  if (isDemoMode()) {
    return { channels: sampleAccounts.map((a) => ({ channel: a.channel, handle: a.handle, connected: a.connected })), current: null };
  }
  const user = await getAuthUser();
  if (!user) return { channels: [], current: new Map() };
  const supabase = await createClient();
  /* 칸을 적는다 — 토큰 칸은 세션이 읽을 수 없고(0085) select("*") 는 조회 전체를 떨어뜨린다. platform_user_id 는 읽힌다 */
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("channel, handle, connected, platform_user_id")
    .eq("user_id", user.id);
  if (error) {
    console.error("[publish] 연동 채널 조회 실패:", error.message);
    return { channels: null, current: null };
  }
  const rows = (data ?? []) as Array<{ channel: string; handle: string | null; connected: boolean; platform_user_id: string | null }>;
  const current = new Map<string, CurrentAccount>();
  for (const r of rows) {
    const id = r.platform_user_id !== null && r.platform_user_id !== undefined ? String(r.platform_user_id).trim() : "";
    if (r.connected && id) current.set(r.channel, { platformUserId: id, handle: r.handle });
  }
  return {
    channels: rows.map((r) => ({ channel: r.channel, handle: r.handle, connected: !!r.connected })),
    current,
  };
}

export default async function PublishPage() {
  const accountsP = loadAccounts();
  const [{ items, truncated, failed }, { channels }] = await Promise.all([loadScheduled(accountsP), accountsP]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="발행"
        description="인스타그램·스레드에 사진·영상 게시물을 지금 올리거나 예약합니다. 예약한 시각부터 5분 안에 자동으로 발행돼요."
      />
      <PublishList initialItems={items} channels={channels} isDemo={isDemoMode()} truncated={truncated} loadFailed={failed} />
    </div>
  );
}
