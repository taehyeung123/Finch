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
  /** 클라이언트 내비게이션이 시작됐다. 지금 보고 있는 주소를 누른 것이면 진행 중인 이동을 걷는다. */
  begin: (href?: string | null) => void;
  end: () => void;
  /** router.push/replace 를 «이동 중» 표시와 함께 — 버튼에서 화면을 옮길 때 이걸 쓴다 */
  navigate: (href: string, options?: { replace?: boolean; scroll?: boolean }) => void;
  /** 방금(4초 안) 같은 곳으로 가기 시작했나 — 재클릭을 삼킬 때 쓴다 */
  isNavigatingTo: (href: string | null | undefined) => boolean;
};

/* Provider 밖(공개·마케팅 화면)에서는 이 기본값이 쓰인다 — 아무것도 하지 않고, 이동은 next/link 가 평소대로 한다 */
const NavPendingContext = createContext<NavPendingValue>({
  pending: false,
  begin: () => {},
  end: () => {},
  navigate: () => {},
  isNavigatingTo: () => false,
});

/** 이동이 영영 안 끝나는 경우(네트워크 단절 등)의 안전판 — 이 뒤엔 원래 화면으로 돌아간다 */
const SAFETY_MS = 15_000;

/** 같은 목적지를 다시 누르면 이 시간 동안은 삼킨다 — 그 뒤의 재클릭은 «재시도»로 통과시킨다(실패한 이동에서 링크가 죽지 않게) */
const SAME_TARGET_SWALLOW_MS = 4_000;

/** 주소를 «경로+쿼리» 로 맞춘다. 다른 오리진·깨진 주소는 null */
function locationKey(href: string): string | null {
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

function currentKey(): string {
  return window.location.pathname + window.location.search;
}

export function NavPendingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  /* begin() 마다 증가 — 안전판 타이머와 주소 감시를 다시 시작하는 키 */
  const [attempt, setAttempt] = useState(0);

  /* 진행 중인 이동의 기록 — 렌더에 쓰지 않고 이벤트·effect 에서만 읽는다 */
  const pendingRef = useRef(false);
  /** 누르던 순간의 주소. 주소가 이것과 달라지면 새 화면이 커밋된 것이다 */
  const fromRef = useRef<string | null>(null);
  /** 가려는 주소(정규화) — 같은 곳을 또 누른 것인지 가린다 */
  const targetRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);

  const end = useCallback(() => {
    pendingRef.current = false;
    fromRef.current = null;
    targetRef.current = null;
    setPending(false);
  }, []);

  /* 어느 경로로 끝나든(아래 렌더 중 경로 조정 포함) pending 이 false 가 되면 기록을 비운다.
     렌더 중 조정은 ref 를 만질 수 없어 setPending(false) 만 한다 — 예전엔 그 뒤 기록이 남아, **다음** 이동의
     begin() 이 «누르던 순간의 주소»를 갱신하지 않았고(fromRef 가 null 이 아니라서) 주소 감시가 첫 프레임에
     «이미 도착했다»로 판정해 덮개가 1프레임 만에 사라졌다(2026-09-10 소넷 점검, 33a8a49 의 회귀). */
  useEffect(() => {
    if (pending) return;
    pendingRef.current = false;
    fromRef.current = null;
    targetRef.current = null;
  }, [pending]);

  /* 경로가 바뀌면 이동이 끝난 것 — 렌더 중 상태 조정. 경로가 바뀌는 이동에서는 이것이 한 프레임도 새지 않게 해 주는
     유일한 경로다(effect 의 setState 는 한 프레임 늦다). 쿼리만 바뀌는 이동은 아래 «주소 감시»가 맡는다. */
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    if (pending) setPending(false);
  }

  /**
   * 지금 이 주소로 가는 중인가(최근 4초 안에 시작한 것만). 순수 읽기 — ref 만 본다.
   * 응답을 기다리는 사이 같은 메뉴를 또 누르면 Next 는 진행 중인 이동을 **버리고 처음부터** 다시 시작한다
   * (2026-09-10 감사: 요청은 취소되지 않고 결과만 버려진다). 그래서 두 번째 클릭은 삼킨다.
   */
  const isNavigatingTo = useCallback((href: string | null | undefined) => {
    if (!pendingRef.current || !href) return false;
    const key = locationKey(href);
    return key !== null && key === targetRef.current && performance.now() - startedAtRef.current < SAME_TARGET_SWALLOW_MS;
  }, []);

  const begin = useCallback(
    (href?: string | null) => {
      /* 지금 보고 있는 주소를 누르면 새로 가는 곳이 없다. Next 는 마지막 클릭을 따르므로 진행 중이던 이동도 버려진다 —
         덮개를 걷는다(예전엔 그냥 return 해서, 이동 중에 현재 메뉴를 누르면 15초 동안 잠겼다). */
      if (href && locationKey(href) === currentKey()) {
        end();
        return;
      }
      pendingRef.current = true;
      /* 연달아 다른 곳을 누르면 «누르던 순간의 주소»는 처음 것 그대로 둔다 — 아직 아무것도 커밋되지 않았다.
         단, 주소가 이미 그 기록과 다르면 앞선 이동은 끝난 것이다(기록이 남은 채였다) — 지금 주소로 새로 잡는다. */
      const here = currentKey();
      if (fromRef.current === null || fromRef.current !== here) fromRef.current = here;
      targetRef.current = href ? locationKey(href) : null;
      startedAtRef.current = performance.now();
      setAttempt((n) => n + 1);
      setPending(true);
    },
    [end],
  );

  const navigate = useCallback<NavPendingValue["navigate"]>(
    (href, options) => {
      if (isNavigatingTo(href)) return;
      begin(href);
      startTransition(() => {
        if (options?.replace) router.replace(href, { scroll: options.scroll });
        else router.push(href, { scroll: options?.scroll });
      });
    },
    [begin, isNavigatingTo, router],
  );

  /* 주소 감시 — 쿼리만 바뀌는 이동(/library → /library?q=…)과 서버 redirect 는 경로 조정으로 안 잡힌다.
     Next 는 새 화면을 커밋하는 순간 주소를 바꾸므로(HistoryUpdater), «누르던 순간의 주소와 달라졌다» = 도착이다.
     «목표 주소와 같아졌다»로 판정하지 않는다 — redirect·인코딩 차이로 영영 같아지지 않아 15초 멈춤이 재발한다.
     매 프레임 문자열 비교 한 번뿐이고, 이동 중에만 돈다. 숨은 탭은 rAF 가 멈추니 visibilitychange 로 한 번 더 본다.
     알려진 한계: 결과 모달·띠(result-modal.tsx·result-banner.tsx)가 도착 직후 effect 에서 replaceState 로 쿼리를 지운다.
     그 한 프레임 사이에 다른 링크를 누르면 이것을 «도착»으로 오인해 덮개가 일찍 걷힌다 — 창이 한 프레임이라 두지 않는다. */
  useEffect(() => {
    if (!pending) return;
    let frame = 0;
    const check = () => {
      if (fromRef.current !== null && currentKey() !== fromRef.current) {
        end();
        return true;
      }
      return false;
    };
    const loop = () => {
      if (!check()) frame = window.requestAnimationFrame(loop);
    };
    if (!check()) frame = window.requestAnimationFrame(loop);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pending, attempt, end]);

  /* 안전판 — 이동이 실패·취소돼 주소가 끝내 안 바뀌면 원래 화면으로 돌아간다 */
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(end, SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, attempt, end]);

  useEffect(() => {
    window.addEventListener("pageshow", end);
    window.addEventListener("popstate", end);
    return () => {
      window.removeEventListener("pageshow", end);
      window.removeEventListener("popstate", end);
    };
  }, [end]);

  const value = useMemo(
    () => ({ pending, begin, end, navigate, isNavigatingTo }),
    [pending, begin, end, navigate, isNavigatingTo],
  );
  return <NavPendingContext.Provider value={value}>{children}</NavPendingContext.Provider>;
}

export function useNavPending() {
  return useContext(NavPendingContext);
}

/**
 * <main> 의 내용 — 이동 중이면 그 위에 로딩 화면을 덮는다.
 * <main> 은 `relative` 여야 한다(덮개가 그 넓이에 맞춘다). 원래 화면은 언마운트하지 않는다 —
 * 이동이 취소되거나 실패해도 입력 중이던 내용이 남아 있어야 한다.
 *
 * 끝내는 것은 Provider 가 한다(경로 조정·주소 감시·안전판). 여기서 «children 참조가 바뀌면 걷기»를 했었는데,
 * 레이아웃의 children 은 형제 이동·쿼리 이동에서 **같은 참조**라 그 조건은 한 번도 성립하지 않았다(2026-09-10 감사 —
 * 탐색 화면에서 상단바 검색을 하면 덮개가 15초 동안 안 걷혔다). 되살리지 말 것.
 *
 * 쌓임: 바깥 틀은 투명·pointer-events-none 의 z-40, 불투명한 것은 상단바 아래에 붙는 sticky 상자뿐이다.
 *  - 떠나는 화면의 sticky 헤더(탐색 검색 헤더 z-40, 편집기 상단 바 xl:z-30)는 DOM 이 앞이라 같은 z-40 에서 덮개가 이긴다.
 *  - 상단바(z-30)는 가리지 않는다 — 불투명 상자가 top-14(상단바 높이) 아래에서 시작한다.
 *  - 탭바·에이전트 FAB(z-40)는 <main> 보다 DOM 이 뒤라 계속 위에 있다. 화면 안 모달(z-50)은 덮개보다 위다 —
 *    모달 안의 화면 이동 링크는 onNavigate 에서 모달을 닫는다.
 */
export function MainStage({ children }: { children: React.ReactNode }) {
  const { pending } = useNavPending();

  return (
    <>
      {children}
      {pending ? (
        /* data-nav-overlay — loading.tsx 폴백(같은 PageLoading)과 이 덮개를 실측에서 가르는 표식 */
        <div data-nav-overlay className="pointer-events-none absolute inset-0 z-40">
          {/* 긴 화면에서 스크롤이 내려가 있어도 링은 보이는 화면 한가운데에 — 상단바(3.5rem) 아래 뷰포트 높이만큼.
              overflow-hidden — PageLoading 의 min-h(26rem)가 아주 낮은 화면에선 이 상자보다 커서 밖으로 삐져나온다 */}
          <div className="pointer-events-auto sticky top-14 h-[calc(100dvh-3.5rem)] overflow-hidden bg-surface">
            <PageLoading />
          </div>
        </div>
      ) : null}
    </>
  );
}
