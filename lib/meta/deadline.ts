/**
 * 흐름 전체의 시간 예산 — 인스타·스레드 발행 어댑터와 발행 엔진(lib/publish/run.ts)이 같은 것을 쓴다.
 *
 * ⚠️ 시간 예산은 **흐름 전체**에 건다(2026-09-09·09-11 점검). 호출마다 15초 상한만 두면 캐러셀 아이템 생성
 * (순차 10~20왕복)·폴링·발행이 함수 maxDuration 을 넘겨 플랫폼이 함수를 죽이고, 그러면 실패 처리가 실행되지 않아
 * 행이 'publishing' 으로 굳는다. 모든 호출이 같은 Deadline 에서 남은 시간만큼만 기다린다.
 *
 * 이 파일은 import 가 없다 — Node 검사(scripts/test-publish-engine.ts)가 그대로 읽는다.
 */

/** 호출 하나가 기다릴 상한 — 예산이 더 남아 있어도 한 호출을 이 이상 붙들지 않는다 */
export const PER_CALL_TIMEOUT_MS = 15_000;
/** 이보다 적게 남았으면 새 호출을 시작하지 않는다(응답을 받아도 처리할 시간이 없다) */
export const MIN_CALL_BUDGET_MS = 1_500;

export class Deadline {
  private readonly at: number;
  constructor(totalMs: number) {
    this.at = Date.now() + Math.max(0, totalMs);
  }
  remaining(): number {
    return this.at - Date.now();
  }
  /** 다음 호출에 줄 시간 — 없으면 null(예산 소진) */
  slice(): number | null {
    const r = this.remaining();
    return r < MIN_CALL_BUDGET_MS ? null : Math.min(PER_CALL_TIMEOUT_MS, r);
  }
}
