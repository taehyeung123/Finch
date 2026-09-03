import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/cn";

/*
  설정 하위 페이지 공통 틀 — «← 계정 및 설정» 되돌아가기 + 페이지 제목 + 한 기둥 폭.

  앞서는 다섯 칩 탭(SettingsNav)이 모든 설정 화면 위에 붙어 있었다. 2026-09-03 재구성으로
  첫 화면이 목록 허브가 됐으니 탭은 없어지고, 하위 화면은 **어디서 왔는지**만 알려 주면 된다.
  브라우저 뒤로가기와 같은 곳으로 가지만 링크로도 둔다 — 딥링크로 바로 들어온 사람에게는
  뒤로가기가 사이트 밖이다.

  폭을 묶는 이유: 설정은 읽고 고치는 폼이라 표·그리드와 달리 **넓을수록 나쁘다.**
  1600px 본문에 입력창 하나가 놓이면 라벨과 버튼이 화면 양끝으로 흩어진다(PageHeader 주석의
  «문단 단위 폭 제한» 원칙을 화면 단위로 적용한 예외). 링크팜 계정 화면도 한 기둥이다.
  가운데 정렬은 사이드바가 있는 데스크톱에서 왼쪽에 붙은 좁은 기둥이 «덜 만든 화면»처럼
  읽히기 때문이다 — 설정은 «모드»라 중앙이 자연스럽다.
*/
export function SettingsBack() {
  return (
    <Link
      href="/settings"
      className="trans-state -ml-1.5 inline-flex items-center gap-0.5 rounded-card py-1 pl-1 pr-2 text-[14px] font-medium text-fg-sub hover:bg-tint-hover hover:text-fg"
    >
      <ChevronLeft className="size-4" aria-hidden />
      계정 및 설정
    </Link>
  );
}

export function SettingsShell({
  title,
  description,
  action,
  width = "md",
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** md = 폼·카드 한 기둥(56rem) · lg = 2단 카드 화면(64rem) */
  width?: "md" | "lg";
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-6", width === "lg" ? "max-w-5xl" : "max-w-4xl")}>
      <div className="space-y-2">
        <SettingsBack />
        <PageHeader title={title} description={description} action={action} />
      </div>
      {children}
    </div>
  );
}
