import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { FinchMark } from "@/components/logo";

export const metadata: Metadata = {
  title: "탈퇴 완료",
  /* 없으면 랜딩의 서비스 소개문이 그대로 상속돼 «탈퇴 완료» 화면에 엉뚱한 설명이 붙는다 */
  description: "계정과 연동 정보, 저장한 콘텐츠가 모두 삭제되었습니다. 그동안 이용해 주셔서 고맙습니다.",
  robots: { index: false, follow: false },
};

/*
  탈퇴 완료 — 회원탈퇴 후 도착하는 곳.

  랜딩(/)으로 그냥 튕기면 **정말 지워졌는지** 알 수가 없다. 되돌릴 수 없는 동작일수록
  끝났다는 확인이 필요하다. 랜딩에 ?left=1 배너를 다는 대신 별도 화면인 이유는,
  그러면 SEO 대상인 랜딩이 searchParams 때문에 동적 렌더로 내려가기 때문이다.
*/
export default function GoodbyePage() {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center px-4 py-28 text-center md:px-6">
      <FinchMark className="size-10 text-primary" />
      <h1 className="mt-6 text-[28px] font-bold leading-[1.25]">탈퇴가 완료됐어요</h1>
      <p className="mt-4 text-[15px] leading-[1.7] text-fg-sub">
        계정과 연동 정보, 저장한 콘텐츠가 모두 삭제됐습니다. 그동안 핀치를 써주셔서 고맙습니다.
        <br />
        결제 내역은 관련 법령에 따라 개인 식별 정보를 지운 상태로만 보관됩니다.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2.5">
        <ButtonLink href="/">홈으로</ButtonLink>
        <ButtonLink href="/signup" variant="secondary">
          다시 시작하기
        </ButtonLink>
      </div>
    </section>
  );
}
