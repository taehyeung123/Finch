import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 내 예약 발행 목록 — RLS로 본인 행만 반환. 최신순 20건. */
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] });

  const { data, error } = await supabase
    .from("scheduled_posts")
    .select("id, caption, image_urls, scheduled_at, status, error, created_at")
    .order("scheduled_at", { ascending: true })
    .limit(20);
  if (error) {
    console.error("[studio:scheduled] 조회 실패:", error.message);
    return NextResponse.json({ items: [] });
  }
  return NextResponse.json({ items: data ?? [] });
}
