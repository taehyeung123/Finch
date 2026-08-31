import type { Metadata } from "next";
import { DeletionStatus } from "@/components/legal/deletion-status";

/*
  instagram 데이터 삭제 요청 상태 확인 페이지 (공개, 로그인 불필요).
  app/api/auth/instagram/data-deletion/route.ts 가 반환하는 confirmation url 이 여기로 연결된다.

  화면은 components/legal/deletion-status.tsx 하나를 두 채널이 공유한다 —
  예전엔 같은 파일이 두 벌이었고, 둘 다 **조회 없이** «삭제 완료» 를 확언했다.
*/

export const metadata: Metadata = {
  /* 레이아웃 템플릿이 «| 핀치 (Finch)» 를 붙인다 — 브랜드를 직접 쓰면 이중 표기 */
  title: "데이터 삭제 처리 확인",
  robots: { index: false, follow: false },
};

export default async function InstagramDataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <DeletionStatus channel="instagram" code={id} />;
}
