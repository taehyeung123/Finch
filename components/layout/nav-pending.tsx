"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageLoading } from "@/components/ui/page-loading";

/*
  «이동 중» 상태 — 클릭한 순간부터 새 화면이 도착할 때까지.

  왜 필요한가(2026-09-10 사장님 신고 «클릭하면 한 박자 늦거나 무시된다», 운영에서 실측):
  사이드바를 누르면 서버 응답의 첫 바이트(0.6~1.1초)가 올 때까지 화면에 **아무 변화가 없었다.**
  Next 의 loading.tsx 는 서버가 스트리밍을 시작해야 뜨고, 프리페치가 꺼진 링크는 클릭 뒤에야 요청이 나간다.
  그 무반응 구간에 사람은 다시 누르고, 두 번째 클릭이 첫 이동을 취소하고 처음부터 시작하니 «무시당한» 것처럼 보였다.

  해법은 클라이언트가 스스로 아는 사실을 바로 쓰는 것이다 — 클릭했다는 사실. Link 의 onNavigate 가 begin() 을 부르고,
  <main> 을 감싼 MainStage 가 그 즉시 로딩 화면(PageLoading, loading.tsx 와 같은 모양)을 덮는다.
  새 화면이 도착하면(children 이 바뀌면) 덮개를 걷는다 — 그 자리에 loading.tsx 폴백이든 실제 화면이든 같은 자리에 이어진다.

  끝내는 조건 셋: ① 경로가 바뀜(렌더 중 조정) ② children 이 바뀜(쿼리만 바뀐 이동·router.refresh) ③ 15초 안전판.
  뒤로가기·bfcache 복귀(pageshow)도 걷는다.
*/

type NavPendingValue = {
  pending: boolean;
  /** 클라이언트 내비게이션이 시작됐다. 지금 보고 있는 주소와 같으면 무시한다(같은 메뉴 재클릭). */
  begin: (href?: string | null) => void;
  end: () => void;
  /** router.push/replace 를 «이동 중» 표시와 함께 — 버튼에서 화면을 옮길 때 이걸 쓴다 */
  navigate: (href: string, options?: { replace?: boolean; scroll?: boolean }) => void;
};

const NavPendingContext = createContext<NavPendingValue>({
  pending: false,
  begin: () => {},
  end: () => {},
  navigate: () => {},
});

/** 이동이 영영 안 끝나는 경우(네트워크 단절 등)의 안전판 — 이 뒤엔 원래 화면으로 돌아간다 */
const SAFETY_MS = 15_000;

function isCurrentLocation(href: string): boolean {
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    return url.pathname === window.location.pathname && url.search === window.location.search;
  } catch {
    return false;
  }
}

export function NavPendingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  /* begin() 마다 증가 — 안전판 타이머를 다시 시작하는 키 */
  const [attempt, setAttempt] = useState(0);

  /* 경로가 바뀌면 이동이 끝난 것 — 렌더 중 상태 조정(effect 의 setState 는 한 프레임 늦고 린트도 막는다) */
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    if (pending) setPending(false);
  }

  const end = useCallback(() => setPending(false), []);

  const begin = useCallback((href?: string | null) => {
    if (href && isCurrentLocation(href)) return;
    setAttempt((n) => n + 1);
    setPending(true);
  }, []);

  const navigate = useCallback<NavPendingValue["navigate"]>(
    (href, options) => {
      begin(href);
      startTransition(() => {
        if (options?.replace) router.replace(href, { scroll: options.scroll });
        else router.push(href, { scroll: options?.scroll });
      });
    },
    [begin, router],
  );

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, attempt]);

  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    window.addEventListener("popstate", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      window.removeEventListener("popstate", reset);
    };
  }, []);

  const value = useMemo(() => ({ pending, begin, end, navigate }), [pending, begin, end, navigate]);
  return <NavPendingContext.Provider value={value}>{children}</NavPendingContext.Provider>;
}

export function useNavPending() {
  return useContext(NavPendingContext);
}

/**
 * <main> 의 내용 — 이동 중이면 그 위에 로딩 화면을 덮는다.
 * <main> 은 `relative` 여야 한다(덮개가 그 넓이에 맞춘다). 원래 화면은 언마운트하지 않는다 —
 * 이동이 취소되거나 실패해도 입력 중이던 내용이 남아 있어야 한다.
 */
export function MainStage({ children }: { children: React.ReactNode }) {
  const { pending, end } = useNavPending();

  /* 새 화면이 도착했다 = 서버가 준 children 이 바뀌었다. 경로가 같고 쿼리만 바뀐 이동, router.refresh 가 여기서 걷힌다.
     (사이드바·채널 스위처 같은 클라이언트 상태 변화로는 children 참조가 바뀌지 않는다 — 서버 트리는 그대로다.) */
  const seenChildren = useRef(children);
  useEffect(() => {
    if (seenChildren.current === children) return;
    seenChildren.current = children;
    end();
  }, [children, end]);

  return (
    <>
      {children}
      {pending ? (
        <div className="absolute inset-0 z-20 bg-surface">
          {/* 긴 화면에서 스크롤이 내려가 있어도 링은 보이는 화면 한가운데에 — 상단바(3.5rem) 아래 뷰포트 높이만큼 */}
          {/* overflow-hidden — PageLoading 의 min-h(26rem)가 아주 낮은 화면에선 이 상자보다 커서 밖으로 삐져나온다 */}
          <div className="sticky top-14 h-[calc(100dvh-3.5rem)] overflow-hidden">
            <PageLoading />
          </div>
        </div>
      ) : null}
    </>
  );
}
