import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

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
  const scheduledDate = asDraft && !scheduledAt ? new Date() : new Date(scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "발행 예정일이 올바르지 않습니다." }, { status: 400 });
  }
  if (!asDraft) {
    // 날짜만 비교(당일 새벽 배치가 이미 지났을 수 있어 '오늘'까지는 허용, 과거 날짜만 차단)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (scheduledDate < today) {
      return NextResponse.json({ error: "오늘보다 이전 날짜로는 예약할 수 없어요." }, { status: 400 });
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
