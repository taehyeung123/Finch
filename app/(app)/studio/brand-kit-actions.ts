"use server";

import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/*
  나만의 디자인(브랜드 킷) — 커스텀 색 팔레트 + 로고.
  로고는 클라이언트가 data URL(base64)로 보내면 서버가 brand-logos 버킷에 올린다.
  마이그레이션 0015 필요. 데모/미로그인이면 null/실패로 폴백한다.
*/

export type LogoPlacement = "cover" | "closing" | "all" | "none";

export interface BrandKit {
  id: string;
  name: string;
  ink: string;
  paper: string;
  accent: string;
  onAccent: string;
  logoUrl: string | null;
  logoPlacement: LogoPlacement;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function safeHex(v: unknown, fallback: string): string {
  return typeof v === "string" && HEX.test(v) ? v : fallback;
}

interface KitRow {
  id: string;
  name: string;
  ink: string;
  paper: string;
  accent: string;
  on_accent: string;
  logo_path: string | null;
  logo_placement: LogoPlacement;
}

function rowToKit(row: KitRow, logoUrl: string | null): BrandKit {
  return {
    id: row.id,
    name: row.name,
    ink: row.ink,
    paper: row.paper,
    accent: row.accent,
    onAccent: row.on_accent,
    logoUrl,
    logoPlacement: row.logo_placement,
  };
}

/** 사용자의 브랜드 킷 로드 (기본 킷 우선, 없으면 null) */
export async function getBrandKit(): Promise<BrandKit | null> {
  if (isDemoMode()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("brand_kits")
    .select("id, name, ink, paper, accent, on_accent, logo_path, logo_placement")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const row = data as KitRow;
  const logoUrl = row.logo_path
    ? supabase.storage.from("brand-logos").getPublicUrl(row.logo_path).data.publicUrl
    : null;
  return rowToKit(row, logoUrl);
}

export interface SaveBrandKitInput {
  name?: string;
  ink: string;
  paper: string;
  accent: string;
  onAccent: string;
  logoPlacement: LogoPlacement;
  /** 새 로고 data URL. undefined면 기존 유지, null이면 로고 제거 */
  logoDataUrl?: string | null;
}

export async function saveBrandKit(
  input: SaveBrandKitInput,
): Promise<{ ok: true; kit: BrandKit } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 사용할 수 없어요." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: existing } = await supabase
    .from("brand_kits")
    .select("id, logo_path")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let logoPath: string | null | undefined = undefined; // undefined = 변경 없음
  if (input.logoDataUrl === null) {
    // 로고 제거 — 기존 파일 삭제
    if (existing?.logo_path) await supabase.storage.from("brand-logos").remove([existing.logo_path]);
    logoPath = null;
  } else if (typeof input.logoDataUrl === "string" && input.logoDataUrl.startsWith("data:")) {
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(input.logoDataUrl);
    if (!m) return { ok: false, error: "로고 이미지 형식이 올바르지 않아요." };
    const ext = m[1].includes("png") ? "png" : m[1].includes("svg") ? "svg" : m[1].includes("webp") ? "webp" : "jpg";
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 2 * 1024 * 1024) return { ok: false, error: "로고는 2MB 이하만 업로드할 수 있어요." };
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("brand-logos").upload(path, buf, { contentType: m[1], upsert: true });
    if (upErr) {
      console.error("[brand-kit] 로고 업로드 실패:", upErr.message);
      return { ok: false, error: "로고 업로드에 실패했어요." };
    }
    if (existing?.logo_path && existing.logo_path !== path) {
      await supabase.storage.from("brand-logos").remove([existing.logo_path]);
    }
    logoPath = path;
  }

  const record = {
    user_id: user.id,
    name: (input.name ?? "내 브랜드").slice(0, 40) || "내 브랜드",
    ink: safeHex(input.ink, "#0C0C11"),
    paper: safeHex(input.paper, "#FAF8F4"),
    accent: safeHex(input.accent, "#FF6B4A"),
    on_accent: safeHex(input.onAccent, "#FAF8F4"),
    logo_placement: input.logoPlacement,
    is_default: true,
    ...(logoPath !== undefined ? { logo_path: logoPath } : {}),
  };

  const write = existing
    ? await supabase.from("brand_kits").update(record).eq("id", existing.id).select().single()
    : await supabase.from("brand_kits").insert(record).select().single();
  if (write.error || !write.data) {
    console.error("[brand-kit] 저장 실패:", write.error?.message);
    return { ok: false, error: "저장에 실패했어요. 다시 시도해 주세요." };
  }

  const row = write.data as KitRow;
  const logoUrl = row.logo_path ? supabase.storage.from("brand-logos").getPublicUrl(row.logo_path).data.publicUrl : null;
  return { ok: true, kit: rowToKit(row, logoUrl) };
}

export async function deleteBrandKit(): Promise<void> {
  if (isDemoMode()) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data } = await supabase.from("brand_kits").select("logo_path").eq("user_id", user.id);
  const paths = (data ?? []).map((d) => (d as { logo_path: string | null }).logo_path).filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from("brand-logos").remove(paths);
  await supabase.from("brand_kits").delete().eq("user_id", user.id);
}
