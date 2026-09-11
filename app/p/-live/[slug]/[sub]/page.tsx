import type { Metadata } from "next";
import PublicSubPage, { generateMetadata as subMetadata, generateViewport as subViewport } from "../../../[slug]/[sub]/page";

/*
  서브 페이지 — **즉석 경로**. 창고 라우트(app/p/[slug]/[sub]/page.tsx)와 같은 함수를 live=true 로 부른다.
  왜 따로 있는지는 app/p/-live/[slug]/page.tsx 참조.
*/
export const dynamic = "force-dynamic";

type P = { params: Promise<{ slug: string; sub: string }> };

export async function generateViewport({ params }: P) {
  return subViewport({ params, live: true });
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  return subMetadata({ params, live: true });
}

export default async function LivePublicSubPage({ params }: P) {
  return PublicSubPage({ params, live: true });
}
