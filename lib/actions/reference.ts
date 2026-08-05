"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import type { Channel, ReferenceSource } from "@/lib/types";

/*
  레퍼런스 수집 기준 CRUD — 마이그레이션 0018_reference_library.sql 위에서 동작.

  - 인증은 getUser()로만 확인, 쓰기는 사용자 세션(RLS 본인 행)으로만.
  - 값 검증은 서버에서 하고, 길이·종류는 DB 제약이 한 번 더 막는다(이중 방어).
  - 데모 모드는 DB 없이 화면 목데이터로만 동작하므로 여기서는 거부한다.
  - 수집 실행 자체는 수집 엔진(3rd party) 연동 후 추가된다 — 지금은 기준 등록까지가 실기능.
*/

const CHANNELS: Channel[] = ["instagram", "tiktok", "threads"];
const KINDS = ["keyword", "account", "hashtag"] as const;
type SourceKind = (typeof KINDS)[number];

/** 사용자당 수집 기준 상한 — 무분별한 등록으로 수집 큐가 터지는 것 방지 */
const MAX_SOURCES = 30;

export type AddSourceResult = { ok: true; source: ReferenceSource } | { ok: false; error: string };

/** kind별 값 정규화·검증. 실패 시 null */
function normalizeValue(kind: SourceKind, raw: string): string | null {
  let v = raw.trim();
  if (kind === "account") {
    v = v.replace(/^@/, "");
    // 프로필 URL 붙여넣기 허용 — 마지막 경로 조각에서 핸들 추출
    const m = v.match(/(?:instagram\.com|tiktok\.com|threads\.net)\/@?([A-Za-z0-9._]+)/);
    if (m) v = m[1];
    if (!/^[A-Za-z0-9._]{2,30}$/.test(v)) return null;
    return `@${v}`;
  }
  if (kind === "hashtag") {
    v = v.replace(/^#/, "");
    if (v.length < 1 || v.length > 40 || /\s/.test(v)) return null;
    return `#${v}`;
  }
  // keyword
  if (v.length < 1 || v.length > 60) return null;
  return v;
}

export async function listReferenceSources(): Promise<ReferenceSource[] | null> {
  if (isDemoMode()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("reference_sources")
    .select("id, channel, kind, value, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) {
    // 테이블 미적용(0018 미실행)이면 빈 목록으로 화면은 살리고 로그로만 알린다
    console.error("[reference] 소스 조회 실패:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    channel: r.channel as Channel,
    kind: r.kind as SourceKind,
    value: r.value as string,
    createdAt: r.created_at as string,
  }));
}

export async function addReferenceSource(input: {
  channel: string;
  kind: string;
  value: string;
}): Promise<AddSourceResult> {
  if (!CHANNELS.includes(input.channel as Channel)) return { ok: false, error: "채널을 선택해주세요." };
  if (!KINDS.includes(input.kind as SourceKind)) return { ok: false, error: "종류를 선택해주세요." };
  const value = normalizeValue(input.kind as SourceKind, String(input.value ?? ""));
  if (!value) {
    return {
      ok: false,
      error:
        input.kind === "account"
          ? "계정은 @핸들 또는 프로필 주소 형식으로 입력해주세요."
          : input.kind === "hashtag"
            ? "해시태그는 공백 없이 40자 이내로 입력해주세요."
            : "키워드는 1~60자로 입력해주세요.",
    };
  }

  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 등록할 수 없습니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { count } = await supabase
    .from("reference_sources")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_SOURCES) {
    return { ok: false, error: `수집 기준은 최대 ${MAX_SOURCES}개까지 등록할 수 있어요.` };
  }

  const { data, error } = await supabase
    .from("reference_sources")
    .insert({ user_id: user.id, channel: input.channel, kind: input.kind, value })
    .select("id, channel, kind, value, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 등록된 기준이에요." };
    const missing =
      error.message.includes("does not exist") || error.message.includes("Could not find the table");
    console.error("[reference] 소스 등록 실패:", error.message);
    return {
      ok: false,
      error: missing
        ? "수집함 기능이 아직 준비되지 않았습니다(마이그레이션 0018 미적용). 잠시 후 다시 시도해주세요."
        : "등록에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  revalidatePath("/library");
  return {
    ok: true,
    source: {
      id: data.id as string,
      channel: data.channel as Channel,
      kind: data.kind as SourceKind,
      value: data.value as string,
      createdAt: data.created_at as string,
    },
  };
}

export async function removeReferenceSource(id: string): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // RLS가 본인 행만 허용하지만, 의도를 명시하기 위해 user_id 필터도 건다
  const { error } = await supabase.from("reference_sources").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[reference] 소스 삭제 실패:", error.message);
    return { ok: false };
  }
  revalidatePath("/library");
  return { ok: true };
}
