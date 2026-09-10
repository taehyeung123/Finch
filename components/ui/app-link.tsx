"use client";

import Link, { useLinkStatus } from "next/link";
import { useState } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useNavPending } from "@/components/layout/nav-pending";

/*
  앱 안의 화면 이동 링크 — next/link 위에 두 가지를 얹는다.

  ① 누르는 즉시 «이동 중»(components/layout/nav-pending.tsx) — 서버 응답을 기다리지 않고 로딩 화면이 덮인다.
     onNavigate 는 클라이언트 내비게이션에서만 불린다(새 탭 열기·외부 주소·download 는 제외) — 정확히 우리가 원하는 조건.
  ② prefetch="intent" — 마우스가 올라오거나 포커스·터치가 시작될 때부터 프리페치한다.
     사이드바처럼 항상 보이는 링크 14개를 뷰포트 기준으로 전부 프리페치하면 첫 페인트마다 요청 14개가 나가고(요금 방어 기획서),
     완전히 끄면 클릭 뒤에야 요청이 나가 한 박자 늦는다. «갈 것 같은 링크만» 이 그 사이다(Next 문서 prefetching.md 의 hover 패턴).
     값을 안 주면 next/link 기본값(뷰포트 진입 시)이다.
*/
type AppLinkProps = Omit<React.ComponentProps<typeof Link>, "prefetch"> & {
  prefetch?: boolean | null | "intent";
};

function hrefToString(href: AppLinkProps["href"]): string | null {
  if (typeof href === "string") return href;
  if (href && typeof href === "object") {
    const pathname = href.pathname ?? "";
    const search = typeof href.search === "string" ? href.search : href.query ? `?${new URLSearchParams(href.query as Record<string, string>).toString()}` : "";
    return pathname ? `${pathname}${search}` : null;
  }
  return null;
}

export function AppLink({ prefetch, onNavigate, onMouseEnter, onFocus, onTouchStart, href, ...rest }: AppLinkProps) {
  const { begin } = useNavPending();
  const [intent, setIntent] = useState(false);
  const intentMode = prefetch === "intent";
  const prefetchProp: boolean | null | undefined = intentMode ? (intent ? null : false) : prefetch;

  return (
    <Link
      href={href}
      prefetch={prefetchProp}
      onMouseEnter={(e) => {
        if (intentMode) setIntent(true);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        if (intentMode) setIntent(true);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        if (intentMode) setIntent(true);
        onTouchStart?.(e);
      }}
      onNavigate={(e) => {
        /* 바깥 onNavigate 가 이동을 막았으면 «이동 중»도 켜지 않는다 */
        let prevented = false;
        if (onNavigate) {
          onNavigate({
            preventDefault: () => {
              prevented = true;
              e.preventDefault();
            },
          });
        }
        if (!prevented) begin(hrefToString(href));
      }}
      {...rest}
    />
  );
}

/**
 * 링크 안 아이콘 — 그 링크의 이동이 진행 중이면 회전하는 원으로 바뀐다(useLinkStatus).
 * 자리 크기가 같아 레이아웃이 움직이지 않는다. 프리페치가 끝난 링크는 pending 이 건너뛰어져 그대로 아이콘이다.
 * 반드시 <AppLink>/<Link> 의 자손으로 쓴다.
 */
export function LinkStatusIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <LoaderCircle className={cn(className, "animate-spin")} aria-hidden />
  ) : (
    <Icon className={className} aria-hidden />
  );
}
