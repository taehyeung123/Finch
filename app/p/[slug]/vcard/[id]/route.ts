import { createClient } from "@/lib/supabase/server";
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config";
import { linkWorkspace } from "@/lib/data";

/*
  연락처 저장 — 「연락처」 블록의 vCard(.vcf) 내려받기(리틀리 흡수 4단계).
  목적지는 /go 와 같은 이유로 **published_snapshot 에서만** 읽는다(초안은 공개가 아니다).
  값은 스냅샷 저장 시 sanitize 됐지만 vCard 줄바꿈 인젝션은 여기서 한 번 더 막는다(CR/LF 제거).
*/

const s = (d: Record<string, unknown>, k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
const esc = (v: string) => v.replace(/[\r\n]+/g, " ").replace(/([,;\\])/g, "\\$1").trim();

function vcardOf(d: Record<string, unknown>): string | null {
  const name = esc(s(d, "name"));
  if (!name) return null;
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${name}`, `N:${name};;;;`];
  if (s(d, "org")) lines.push(`ORG:${esc(s(d, "org"))}`);
  if (s(d, "role")) lines.push(`TITLE:${esc(s(d, "role"))}`);
  if (s(d, "phone")) lines.push(`TEL;TYPE=CELL:${esc(s(d, "phone"))}`);
  if (s(d, "email")) lines.push(`EMAIL;TYPE=INTERNET:${esc(s(d, "email"))}`);
  if (s(d, "website")) lines.push(`URL:${esc(s(d, "website"))}`);
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  let data: Record<string, unknown> | null = null;

  if (isDemoMode()) {
    data = linkWorkspace.blocks.find((b) => b.id === id && b.type === "vcard")?.data ?? null;
  } else if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: page } = await supabase.from("link_pages").select("published_snapshot").eq("slug", slug).eq("published", true).maybeSingle();
    const blocks = (page?.published_snapshot as { blocks?: Array<{ id: string; type: string; data: Record<string, unknown> }> } | null)?.blocks ?? [];
    data = blocks.find((b) => b.id === id && b.type === "vcard")?.data ?? null;
  }

  const vcf = data ? vcardOf(data) : null;
  if (!vcf) return new Response("Not found", { status: 404 });
  const fname = encodeURIComponent(s(data ?? {}, "name").replace(/[^\w가-힣 .-]/g, "").slice(0, 40) || "contact");
  return new Response(vcf, {
    status: 200,
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="contact.vcf"; filename*=UTF-8''${fname}.vcf`,
      "cache-control": "no-store",
    },
  });
}
