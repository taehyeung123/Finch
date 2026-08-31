import type { Metadata } from "next";
import { DeletionStatus } from "@/components/legal/deletion-status";

/*
  메타 광고 데이터 삭제 요청 상태 확인 페이지 (공개, 로그인 불필요).
  app/api/auth/meta-ads/data-deletion/route.ts 가 반환하는 confirmation url 이 여기로 연결된다.
*/

export const metadata: Metadata = {
  /* 레이아웃 템플릿이 «| 핀치 (Finch)» 를 붙인다 — 브랜드를 직접 쓰면 이중 표기 */
  title: "데이터 삭제 처리 확인",
  robots: { index: false, follow: false },
};

export default async function MetaAdsDataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <DeletionStatus channel="meta_ads" code={id} />;
}
