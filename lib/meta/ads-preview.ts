import { fbGetResult, type AdsWriteResult } from "./ads-write";
import type { AdPreviewFormat } from "@/lib/ads/preview-formats";

export { AD_PREVIEW_FORMATS, AD_PREVIEW_FORMAT_KEYS, type AdPreviewFormat } from "@/lib/ads/preview-formats";

/**
 * 광고 미리보기 — `GET /act_{id}/generatepreviews` (소재를 **만들기 전**, 스펙 §5.1).
 *
 * 응답은 `<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?…" width=… height=…>` HTML 한 덩어리다.
 * 서버가 src·width·height 만 뽑아 돌려주고 클라이언트가 **우리 iframe** 을 그린다(dangerouslySetInnerHTML 금지).
 * src 는 https + www.facebook.com + /ads/api/preview_iframe.php 가 아니면 버린다 — CSP frame-src 도 그 경로만 연다(§13-18).
 * 유효기간 24시간 — DB 에 저장하지 않는다.
 */

export const PREVIEW_IFRAME_HOST = "www.facebook.com";
export const PREVIEW_IFRAME_PATH = "/ads/api/preview_iframe.php";

export interface AdPreviewFrame {
  src: string;
  width: number;
  height: number;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** body HTML → iframe 정보. 호스트·경로가 다르면 null(«실패»로 다룬다 — 남의 주소를 프레이밍하지 않는다) */
export function parsePreviewBody(body: string): AdPreviewFrame | null {
  const src = /<iframe\b[^>]*\bsrc="([^"]+)"/i.exec(body)?.[1];
  if (!src) return null;
  let url: URL;
  try {
    url = new URL(decodeEntities(src));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.host !== PREVIEW_IFRAME_HOST || url.pathname !== PREVIEW_IFRAME_PATH) return null;
  const w = Number(/\bwidth="(\d+)"/i.exec(body)?.[1]);
  const h = Number(/\bheight="(\d+)"/i.exec(body)?.[1]);
  return {
    src: url.toString(),
    /* 크기 속성이 없으면 문서 권장 최소(280) 위로 — iframe 크기만 바뀌고 안의 광고 렌더는 안 바뀐다(§5.1) */
    width: Number.isFinite(w) && w > 0 ? w : 320,
    height: Number.isFinite(h) && h > 0 ? h : 560,
  };
}

/** 미리보기 한 장. ok 인데 data 가 null 이면 «응답은 왔지만 쓸 수 있는 iframe 이 없다» — 호출측이 preview_failed 로 말한다 */
export async function generateAdPreview(
  adAccountId: string,
  creativeSpec: Record<string, unknown>,
  adFormat: AdPreviewFormat,
  accessToken: string,
): Promise<AdsWriteResult<AdPreviewFrame | null>> {
  const res = await fbGetResult<{ data?: { body?: unknown }[] }>(
    `/act_${adAccountId}/generatepreviews`,
    { creative: JSON.stringify(creativeSpec), ad_format: adFormat },
    accessToken,
  );
  if (!res.ok) return res;
  const body = Array.isArray(res.data.data) ? res.data.data[0]?.body : undefined;
  return { ok: true, data: typeof body === "string" ? parsePreviewBody(body) : null, usage: res.usage };
}
