import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { earliestPublishDate } from "@/lib/calendar";

/**
 * 카드뉴스 예약 발행 등록 — 이미지(FormData)를 Storage(cardnews 버킷, 본인 폴더)에 업로드하고
 * scheduled_posts 행을 만든다. 발행은 여기서 하지 않고 일일 크론(/api/cron/publish-scheduled)이
 * 처리한다 — Vercel 크론은 하루 1회 빈도 제한이라 '예약일의 아침 배치'로 안내한다.
 */
export const runtime = "nodejs";

const MAX_IMAGES = 10;

export async function POST(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json({ error: "데모 모드에서는 예약 발행을 사용할 수 없어요." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const caption = String(form.get("caption") ?? "").trim();
  const scheduledAt = String(form.get("scheduledAt") ?? "").trim();
  /* 초안 = 날짜 미정. 크론은 status='scheduled' 만 조회하므로 초안은 절대 발행되지
     않는다(0043). 앞서는 날짜를 정해야만 저장할 수 있어서, 오늘 만들었지만 언제
     올릴지 안 정한 콘텐츠는 화면을 떠나는 순간 사라졌다 — 크레딧을 쓴 결과물인데도. */
  const asDraft = String(form.get("draft") ?? "") === "1";
  const images = form.getAll("images").filter((v): v is File => v instanceof File);

  if (!caption) {
    return NextResponse.json({ error: "캡션을 입력해 주세요." }, { status: 400 });
  }
  if (images.length === 0 || images.length > MAX_IMAGES) {
    return NextResponse.json({ error: "이미지가 없거나 너무 많아요 (최대 10장)." }, { status: 400 });
  }
  /* scheduled_at 은 not null 이다. 초안은 날짜가 "미정"이라는 뜻이므로 값이 필요하면
     지금 시각을 넣는다 — 화면은 status 로 판단해 "날짜 미정"으로 표시하고, 캘린더에도
     찍지 않는다. 초안에 과거 날짜 검증을 걸면 저장 자체가 막힌다. */

  /* ⚠️ **KST 자정으로 못박는다.** new Date("2026-08-20") 은 ISO 날짜만 있는 문자열이라
     JS 가 UTC 자정으로 파싱한다 = KST 09:00. 그런데 발행 배치는 KST 06:00 에 돌고
     (vercel.json "0 21 * * *" = UTC 21시) 조건이 scheduled_at <= now 다.
     그래서 09:00 로 저장된 건 그날 아침 배치에 안 걸리고 **다음 날 아침**에 걸렸다 —
     화면은 "예약일 아침 배치에서 자동 발행됩니다"라고 안내하는데 하루 늦게 나갔다.
     2026-08-17 실측: 8/20 예약 → 8/21 06:00 KST 발행.
     초안→예약 경로(app/(app)/publish/actions.ts)는 처음부터 KST 자정을 썼기 때문에
     같은 날짜를 골라도 두 경로의 발행일이 하루 달랐다. 여기를 그쪽에 맞춘다. */
  const scheduledDate =
    asDraft && !scheduledAt ? new Date() : new Date(`${scheduledAt}T00:00:00+09:00`);
  if (Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "발행 예정일이 올바르지 않습니다." }, { status: 400 });
  }
  if (!asDraft) {
    /* 과거 차단도 **KST 기준**이다. new Date() 를 서버 로컬(Vercel=UTC)로 자르면
       KST 00~09시에는 오늘이 어제로 잡혀 이미 지난 날짜가 통과한다.
       날짜 문자열끼리 비교하면 타임존이 개입할 여지가 없다. */
    /* 오늘 아침 배치가 이미 지났으면 오늘도 막는다 — 안 막으면 "오늘 발행"이라고
       안내해 놓고 내일 아침에 나간다. */
    if (scheduledAt < earliestPublishDate()) {
      return NextResponse.json(
        { error: "오늘 아침 발행 배치가 이미 지났어요. 내일 이후로 골라 주세요." },
        { status: 400 },
      );
    }
  }

  /* 연동 계정 확인 — 없으면 업로드 전에 즉시 차단(불필요한 스토리지 사용 방지).
     **초안은 검사하지 않는다** — 아직 발행이 아니고, 연동은 예약을 잡을 때 필요하다.
     여기서 막으면 계정을 안 붙인 사람은 만든 것을 저장조차 못 한다. */
  const { data: account } = asDraft
    ? { data: { id: "draft" } }
    : await supabase
        .from("connected_accounts")
        .select("id")
        /* user_id 로 반드시 좁힌다 — "team members read" 정책 때문에 안 좁히면
           팀원이 소유자의 연동으로 게이트를 통과하고, 크론은 user_id 로 토큰을
           찾으므로 그 예약은 반드시 실패한다. */
        .eq("user_id", user.id)
        .eq("channel", "instagram")
        .eq("connected", true)
        .limit(1)
        .maybeSingle();
  if (!account) {
    return NextResponse.json({ error: "먼저 설정에서 인스타그램 계정을 연동해 주세요." }, { status: 400 });
  }

  const batchId = randomUUID();
  const imageUrls: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const file = images[i];
    const buf = Buffer.from(await file.arrayBuffer());
    const objectPath = `${user.id}/${batchId}/${String(i + 1).padStart(2, "0")}.png`;
    const { error: upErr } = await supabase.storage.from("cardnews").upload(objectPath, buf, {
      contentType: "image/png",
      upsert: false,
    });
    if (upErr) {
      console.error("[studio:schedule] 이미지 업로드 실패:", upErr.message);
      return NextResponse.json({ error: "이미지 업로드에 실패했어요. 다시 시도해 주세요." }, { status: 500 });
    }
    const { data: pub } = supabase.storage.from("cardnews").getPublicUrl(objectPath);
    imageUrls.push(pub.publicUrl);
  }

  const { error: insertErr } = await supabase.from("scheduled_posts").insert({
    user_id: user.id,
    caption,
    image_urls: imageUrls,
    scheduled_at: scheduledDate.toISOString(),
    status: asDraft ? "draft" : "scheduled",
  });
  if (insertErr) {
    console.error("[studio:schedule] 예약 등록 실패:", insertErr.message);
    return NextResponse.json({ error: "예약 등록에 실패했어요. 다시 시도해 주세요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
