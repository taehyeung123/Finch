"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
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
  const { begin, isNavigatingTo } = useNavPending();
  const router = useRouter();
  const intentMode = prefetch === "intent";
  /* intent 모드: Link 의 자동 프리페치는 끄고(prefetch={false}) 의도가 보이는 순간 router.prefetch 를 **직접** 부른다.
     prop 을 false→null 로 바꾸는 방식은 그 이벤트의 재렌더 뒤에야 먹혀 한 틱 늦고 우선순위도 낮다(2026-09-10 소넷 점검).
     매번 부른다 — 캐시가 신선하면 Next 가 요청을 보내지 않는다. 예전의 «링크당 평생 1회» 가드는 캐시가 만료된
     몇 분 뒤부터 프리페치를 영영 막아 클릭 뒤에야 요청이 나가게 했다(2026-09-10 감사). */
  const prefetchProp: boolean | null | undefined = intentMode ? false : prefetch;
  const showIntent = () => {
    if (!intentMode) return;
    const target = hrefToString(href);
    if (target) router.prefetch(target);
  };

  return (
    <Link
      href={href}
      prefetch={prefetchProp}
      onMouseEnter={(e) => {
        showIntent();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        showIntent();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        showIntent();
        onTouchStart?.(e);
      }}
      onNavigate={(e) => {
        const target = hrefToString(href);
        /* 방금 같은 곳으로 가기 시작했다 — 이 클릭을 흘려보내면 Next 가 진행 중인 이동을 버리고 처음부터 다시 한다.
           삼킨다(4초 창). 그 뒤의 재클릭은 재시도로 통과한다. */
        if (isNavigatingTo(target)) {
          e.preventDefault();
          return;
        }
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
        if (!prevented) begin(target);
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
