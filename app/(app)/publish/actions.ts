"use server";

import { createClient } from "@/lib/supabase/server";
import { kstToday } from "@/lib/calendar";

/*
  초안 관리 — 2026-08-16 신설.

  초안을 만들어 놓고 **지울 수도, 예약으로 바꿀 수도 없었다.** 저장하는 순간
  스토리지 이미지까지 포함한 결과물이 영구히 DB 에 갇혔고, 그 상태로 쌓이면
  발행 화면 조회(최신 200건)를 밀어내 진짜 미래 예약이 화면에서 사라진다.
  화면 문구는 "언제든 날짜를 정하세요"라고 하면서 그럴 수단이 없었다.

  두 액션 다 RLS(auth.uid()=user_id) 위에서 돌고, 추가로 .eq("status","draft") 를
  건다 — id 만 맞으면 이미 발행된 글까지 손댈 수 있으면 안 된다.
*/

/** 초안 → 예약. date 는 "YYYY-MM-DD"(KST). */
export async function scheduleDraft(id: string, date: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "날짜 형식이 올바르지 않아요." };
  /* 과거 차단은 **KST 기준**이다. UTC 로 비교하면 KST 00~09시에 오늘이 어제로 잡혀
     이미 지난 날짜가 통과한다(그 시간대엔 UTC 가 전날이다). */
  if (date < kstToday()) return { ok: false, error: "오늘보다 이전 날짜로는 예약할 수 없어요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  /* 인스타그램 연동이 없으면 예약해도 배치가 실패로 끝난다 — 여기서 막는다.
     초안 저장 때는 연동을 요구하지 않지만(아직 발행이 아니다), 예약은 발행 약속이다. */
  const { data: account } = await supabase
    .from("connected_accounts")
    .select("id")
    .eq("channel", "instagram")
    .eq("connected", true)
    .limit(1)
    .maybeSingle();
  if (!account) return { ok: false, error: "먼저 설정에서 인스타그램 계정을 연동해 주세요." };

  /* 배치는 KST 06:00 에 돈다(vercel.json "0 21 * * *" = UTC 21시). 그 날 아침에
     집히려면 scheduled_at 이 그 시각 이전이어야 하므로 KST 자정(=UTC 15:00 전날)으로 둔다. */
  const scheduledAt = new Date(`${date}T00:00:00+09:00`).toISOString();

  const { data, error } = await supabase
    .from("scheduled_posts")
    .update({ status: "scheduled", scheduled_at: scheduledAt, error: null })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) {
    console.error("[publish] 초안 예약 전환 실패:", error.message);
    return { ok: false, error: "예약으로 바꾸지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 초안이에요." };
  return { ok: true };
}

/** 초안 삭제. 발행된 글은 지울 수 없다 — 이력이다. */
export async function deleteDraft(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  const { data, error } = await supabase
    .from("scheduled_posts")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) {
    console.error("[publish] 초안 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 초안이에요." };
  /* Storage 의 이미지는 남는다 — cardnews 버킷은 본인 폴더 RLS 라 새는 건 아니지만
     고아 객체가 된다. 버킷 정리는 별도 배치로 다룬다(여기서 지우면 삭제 실패 시
     DB 는 지워졌는데 이미지만 남거나 그 반대가 되는 부분 실패가 생긴다). */
  return { ok: true };
}
