import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { parseKstDateTimeLocal } from "@/lib/calendar";
import { publishGate } from "@/lib/publish/gate";
import { publishDbErrorText } from "@/lib/publish/db-errors";
import { stampPostTarget } from "@/lib/publish/account";

/**
 * 카드뉴스 예약 발행 등록 — 이미지(FormData)를 Storage(cardnews 버킷, 본인 폴더)에 업로드하고
 * scheduled_posts 행을 만든다. 발행은 여기서 하지 않고 크론(/api/cron/publish-scheduled, 5분마다)이
 * 예약 시각이 지난 것을 집어 처리한다(2026-09-09 — 그 전엔 하루 1회 아침 배치였다).
 */
export const runtime = "nodejs";

const MAX_IMAGES = 10;
/* 상한 셋 — 없으면 로그인 30초짜리 계정 하나가 스토리지를 무한히 채운다(2026-09-07 감사).
   스토리지는 사용량 과금이고 cardnews 는 public 버킷이라, 상한이 없으면 우리 도메인이
   임의 파일 호스팅이 된다. 숫자는 컴포저가 실제로 만드는 크기 기준으로 넉넉하게 잡았다
   (카드뉴스 한 장은 보통 200KB~1MB 의 PNG 다).
   ⚠️ 크기 검사는 **파일을 읽기 전에** 한다 — 10장을 순차로 arrayBuffer() 하는 구조라
   큰 파일 하나면 함수 메모리가 통째로 날아간다. */
const MAX_BYTES_PER_IMAGE = 5 * 1024 * 1024;
const MAX_BYTES_TOTAL = 20 * 1024 * 1024;
/** 미발행(초안+예약) 보관 상한 — 예약 발행은 원래 드문 행동이라 이 정도면 정상 사용에 닿지 않는다 */
const MAX_UNPUBLISHED = 60;

export async function POST(request: Request) {
  if (isDemoMode()) {
    /* «데모 모드»는 운영 용어다 — 고객에게는 상태만 말한다(publish/actions.ts DEMO_TEXT 와 같은 규칙) */
    return NextResponse.json({ error: "지금은 예시 화면이라 예약 발행을 할 수 없어요." }, { status: 400 });
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
  /* 크기 상한 — File.size 는 본문을 읽지 않고도 알 수 있다(메모리에 올리기 전에 거른다) */
  let totalBytes = 0;
  for (const file of images) {
    if (file.size > MAX_BYTES_PER_IMAGE) {
      return NextResponse.json({ error: "이미지 한 장이 너무 커요 (한 장당 5MB까지)." }, { status: 400 });
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_BYTES_TOTAL) {
    return NextResponse.json({ error: "이미지 전체 용량이 너무 커요 (합쳐서 20MB까지)." }, { status: 400 });
  }
  /* scheduled_at 은 not null 이다. 초안은 날짜가 "미정"이라는 뜻이므로 값이 필요하면
     지금 시각을 넣는다 — 화면은 status 로 판단해 "날짜 미정"으로 표시하고, 캘린더에도
     찍지 않는다. 초안에 과거 날짜 검증을 걸면 저장 자체가 막힌다. */

  /* ⚠️ **KST 로 못박는다.** `new Date("2026-08-20T09:00")` 처럼 오프셋 없이 파싱하면 서버(UTC)와 브라우저가
     다른 시각을 만든다 — 2026-08-17 실측으로 하루 늦게 나간 적이 있다. parseKstDateTimeLocal 이 +09:00 을 붙인다.
     날짜만 온 옛 형식("YYYY-MM-DD")은 그날 09:00 KST 로 읽는다 — 자정으로 읽으면 «지난 시각»이 되어 막힌다. */
  let scheduledIso: string;
  if (asDraft && !scheduledAt) {
    scheduledIso = new Date().toISOString();
  } else {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(scheduledAt) ? `${scheduledAt}T09:00` : scheduledAt;
    const parsed = parseKstDateTimeLocal(normalized);
    if (!parsed) {
      return NextResponse.json({ error: "발행 시각이 올바르지 않습니다." }, { status: 400 });
    }
    if (!asDraft && Date.parse(parsed) < Date.now() - 60_000) {
      return NextResponse.json({ error: "지난 시각으로는 예약할 수 없어요." }, { status: 400 });
    }
    scheduledIso = parsed;
  }

  /* 발행 관문 — 업로드 전에 즉시 차단(불필요한 스토리지 사용 방지). 발행 화면(publish/actions.ts)과 **같은 함수**다:
     연동이 있는가(user_id 로 좁힌다 — "team members read" 정책 때문에 안 좁히면 팀원이 소유자의 연동으로 통과하고,
     크론은 user_id 로 토큰을 찾으므로 그 예약은 반드시 실패한다) + 발행 권한이 **확실히** 빠지지 않았는가.
     예전엔 연동 행 유무만 봐서, 발행 권한 없이 연결한 계정의 예약을 받아 두고 크론이 돌 때 권한 오류로 실패했다.
     또 조회 «오류»를 «연동 없음»으로 읽어 멀쩡한 사람에게 연동하라고 말했다 — 이제 오류는 오류로 답한다(503).
     **초안은 검사하지 않는다** — 아직 발행이 아니고, 연동은 예약을 잡을 때 필요하다.
     여기서 막으면 계정을 안 붙인 사람은 만든 것을 저장조차 못 한다. */
  if (!asDraft) {
    const gate = await publishGate(supabase, user.id, "instagram");
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.reason === "lookup_failed" ? 503 : 400 });
    }
  }

  /* 미발행 보관 상한 — 업로드 **전에** 한 번 본다(빠른 거절로 스토리지를 아낀다). 진짜 관문은 DB 가드(0093
     scheduled_posts_guard)다: 잠금 아래에서 세어 동시 요청이 상한을 넘지 못하고, 「실패 → 다시 예약」 UPDATE 로도
     우회되지 않는다. 여기 조회가 실패해도 막지 않는다 — 아래 insert 에서 가드가 본다. */
  const { count: pendingCount, error: countErr } = await supabase
    .from("scheduled_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ["draft", "scheduled", "processing", "publishing"]);
  if (countErr) {
    console.error("[studio:schedule] 보관 수 확인 실패(가드가 다시 본다):", countErr.message);
  } else if ((pendingCount ?? 0) >= MAX_UNPUBLISHED) {
    return NextResponse.json(
      { error: `저장해 둔 초안과 예약이 너무 많아요(최대 ${MAX_UNPUBLISHED}개). 발행했거나 필요 없는 것을 지운 뒤 다시 시도해 주세요.` },
      { status: 400 },
    );
  }

  const batchId = randomUUID();
  const imageUrls: string[] = [];
  /* 올린 객체 경로를 함께 모은다 — 아래 저장이 실패하면 **되돌려 지운다**.
     예전에는 그냥 두어 고아가 됐다: 저장에 실패한 카드뉴스가 공개 주소로 영원히 남았다(2026-09-08 감사). */
  const uploaded: string[] = [];
  const rollbackUploads = async () => {
    if (uploaded.length === 0) return;
    const { error: rmErr } = await supabase.storage.from("cardnews").remove(uploaded);
    if (rmErr) console.error("[studio:schedule] 업로드 롤백 실패:", rmErr.message);
  };
  for (let i = 0; i < images.length; i++) {
    const file = images[i];
    const buf = Buffer.from(await file.arrayBuffer());
    /* 인스타 발행 API 는 JPEG 만 받는다 — 스튜디오 패널이 JPEG 로 굽는다(2026-09-09). 옛 클라이언트의 PNG 도
       받되 확장자·타입을 실제 파일에 맞춘다(PNG 발행은 메타 관용도에 달린 스펙 밖 경로다). */
    const isJpeg = file.type === "image/jpeg";
    const objectPath = `${user.id}/${batchId}/${String(i + 1).padStart(2, "0")}.${isJpeg ? "jpg" : "png"}`;
    const { error: upErr } = await supabase.storage.from("cardnews").upload(objectPath, buf, {
      contentType: isJpeg ? "image/jpeg" : "image/png",
      upsert: false,
    });
    if (upErr) {
      console.error("[studio:schedule] 이미지 업로드 실패:", upErr.message);
      await rollbackUploads();
      return NextResponse.json({ error: "이미지 업로드에 실패했어요. 다시 시도해 주세요." }, { status: 500 });
    }
    uploaded.push(objectPath);
    const { data: pub } = supabase.storage.from("cardnews").getPublicUrl(objectPath);
    imageUrls.push(pub.publicUrl);
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("scheduled_posts")
    .insert({
      user_id: user.id,
      caption,
      image_urls: imageUrls,
      scheduled_at: scheduledIso,
      status: asDraft ? "draft" : "scheduled",
    })
    .select("id");
  if (insertErr) {
    await rollbackUploads();
    /* DB 가드(0093)의 거절(상한·지난 시각)은 사람이 고칠 수 있는 이유다 — 그대로 말한다 */
    const known = publishDbErrorText(insertErr);
    if (known) return NextResponse.json({ error: known }, { status: 400 });
    console.error("[studio:schedule] 예약 등록 실패:", insertErr.message);
    return NextResponse.json({ error: "예약 등록에 실패했어요. 다시 시도해 주세요." }, { status: 500 });
  }

  /* 대상 계정(2026-09-12, 0094) — 예약하는 지금 연결된 인스타 계정을 글에 적는다. 계정을 바꾼 뒤 이 예약이 새 계정으로
     새지 않게 한다(lib/publish/account-core.ts). 서버 전용 칸이라 admin 으로 — 로그인 사용자는 이 칸을 쓸 권한이 없다.
     실패해도 예약은 그대로(로그) — 엔진이 나갈 때 지금 계정을 적는다. 초안은 대상이 없다(예약하는 순간 정해진다). */
  const newId = (inserted as Array<{ id?: string }> | null)?.[0]?.id;
  if (!asDraft && newId) {
    const admin = createAdminClient();
    if (!admin) console.error("[studio:schedule] 대상 계정을 적지 못함 — 서버 자격증명 미설정(발행 때 엔진이 다시 본다)");
    else await stampPostTarget(admin, { postId: newId, userId: user.id, channel: "instagram", statuses: ["scheduled"] });
  }

  return NextResponse.json({ ok: true });
}
