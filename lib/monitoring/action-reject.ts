import { unstable_isUnrecognizedActionError } from "next/navigation";

/*
  서버 액션 프라미스가 **reject** 됐을 때의 공용 판정 — 클라이언트 전용(시크릿 없음, server-only 아님).

  왜 필요한가(2026-09-11 감사 «missing-try-finally»): 이 앱의 서버 액션은 평범한 실패를 `{ ok: false }` 로 돌려주지만,
  **전송 자체가 실패하면**(망 끊김·RSC 가 아닌 응답·배포 교체로 액션 id 를 못 찾음) Next 가 프라미스를 reject 한다
  (node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js). 핸들러에 try 가 없으면
  `setBusy(false)` 줄이 영영 안 돌아 버튼이 «…중»에 굳고, 상시 마운트된 카드는 새로고침 전까지 다시 눌리지 않았다.

  그래서 호출부는 `try { … } catch (e) { const hint = actionRejectHint("어디", e); … } finally { 잠금 해제 }` 로 쓴다.
  · 돌려주는 값은 «다음에 할 일» 한 문장이다. 앞 문장(«등록하지 못했어요.»)은 자리마다 호출부가 쓴다 — 문구 자리가
    동작마다 다르기 때문이다(한 칸으로 합치면 남의 오류가 엉뚱한 버튼 옆에 뜬다).
  · `null` = 실패가 아니다(redirect·notFound 신호). 이동은 라우터가 이미 수행한다 — 문구를 띄우지 않는다.
    평범한 이벤트 핸들러에서는 조용히 빠져나오고, `startTransition`/폼 action 안에서는 **다시 던진다**
    (던져야 프레임워크가 신호를 처리한다. 평범한 핸들러에서 던지면 처리되지 않은 거부만 남는다).
  · 배포 교체(액션 id 불일치)는 몇 번을 다시 눌러도 같다 — 그때만 새로고침을 권한다.
    문구에 운영 용어(배포·액션·타임아웃·서버)를 넣지 않는다.
  · «성공한 셈» 폴백 금지: reject 는 결과를 모른다는 뜻이다. 낙관 반영은 되돌리고 실패로 그린다.

  관측: try 로 감싸면 지금까지 Sentry 브라우저 SDK 의 전역 핸들러가 잡던 «처리되지 않은 거부»가 사라진다.
  신호를 잃지 않도록 여기서 직접 올리되, 한 탭에서 같은 자리는 1분에 한 번만 올린다 — 망이 끊긴 채 연타하면
  클릭 수만큼 이벤트가 튀어 무료 한도를 태운다(lib/monitoring/log-throttle.ts 와 같은 이유, 그쪽은 서버용).
  배포 교체는 예정된 사건이라 올리지 않는다.
*/

const RETRY_LATER = "잠시 후 다시 시도해 주세요.";
const RELOAD_FIRST = "새로고침한 뒤 다시 시도해 주세요.";
const REPORT_GAP_MS = 60_000;
const lastReportAt = new Map<string, number>();

/** redirect()·notFound() 류 — 실패가 아니라 라우터 신호다. digest 규약은 next/dist/client/components/is-next-router-error.js */
export function isRouterSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

function report(where: string, error: unknown) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const now = Date.now();
  if (now - (lastReportAt.get(where) ?? 0) < REPORT_GAP_MS) return;
  lastReportAt.set(where, now);
  /* 수집기는 앱 레이아웃의 SentryClient 가 이미 dynamic import 로 띄운다 — 같은 청크를 다시 받지 않는다 */
  void import("@sentry/nextjs")
    .then((Sentry) => {
      if (Sentry.isInitialized()) Sentry.captureException(error, { tags: { actionReject: where } });
    })
    .catch(() => {
      /* 수집기가 없어도 화면 동작은 그대로 */
    });
}

/**
 * reject 된 서버 액션을 판정해 «다음에 할 일» 문장을 돌려준다. `null` 이면 라우터 신호다(문구 없음).
 * @param where 관측용 자리 이름(예: "studio.brand-kit.save") — 고객에게 보이지 않는다
 */
export function actionRejectHint(where: string, error: unknown): string | null {
  if (isRouterSignal(error)) return null;
  if (unstable_isUnrecognizedActionError(error)) return RELOAD_FIRST;
  report(where, error);
  return RETRY_LATER;
}
