/**
 * 크레딧 상수 — **순수 모듈**. server-only도 supabase도 끌지 않는다.
 *
 * lib/actions/credits.ts 는 첫 줄이 `import "server-only"` 이고 supabase 관리자
 * 클라이언트까지 들고 온다. 마케팅 요금제 페이지(app/(marketing)/pricing)가 거기서
 * 값을 가져오면 공개 페이지에 서버 전용 의존이 딸려 들어간다. 그래서 "숫자만" 여기로
 * 뺐고, credits.ts 는 이 파일을 다시 export 한다 — 값의 출처는 끝까지 한 곳이다.
 *
 * 화면과 과금이 갈리면 그게 곧 클레임이다. 단가를 고칠 일이 생기면 이 파일만 고친다.
 */
import type { PaidPlan } from "@/lib/toss/config";

/**
 * 기능별 크레딧 가격 — 1크레딧 = 10원 고정 환율로 실측 원가를 올림(ceil)한 값.
 *
 * ⚠️ **환율(1크레딧=10원)은 고객 화면에 절대 노출하지 않는다.** 노출되는 순간
 * "Creator 460크레딧 = 4,600원인데 9,900원을 받는다"는 계산이 즉시 가능해진다.
 * 화면에는 '크레딧'이라는 단위만 존재한다(CLAUDE.md 내부 운영 정보 비노출 규칙).
 */
export const CREDIT_COSTS = {
  /** AI 카드뉴스 생성 1회 — 실측 200원 */
  cardnews: 20,
  /** 성장 진단(실측 성과 분석 + AI) 1회 — 실측 200원 */
  diagnosis: 20,
  /** 레퍼런스 수집 1회(개인 수집 + 실시간 풀 수집 공용) — 실측 100원 */
  collect: 10,
  /** 메타광고 레퍼런스 수집 1회 — 실측 100원 */
  adCollect: 10,
  /** 릴스 대본 추출 1회 — 실측 2원(최소 단위 1크레딧) */
  transcript: 1,
  /** 아이디어 추천 1회 — 카드뉴스와 토큰·사고 설정이 같아 원가도 같다 */
  ideas: 20,
  /** 브랜드 톤 학습 1회 — 실측 100원 */
  brandTone: 10,
  /** AI 에이전트 메시지 1건 — 실측 35원 */
  agentChat: 4,
  /**
   * 풀 영상 AI 분석 1회(새 분석만 — 캐시 히트는 무료).
   * 2 → 5 (2026-08-15 실측 후 인상). 쏘넷 5 도입가 기준 18.1원, 2026-09-01 정가
   * 전환 후 27.2원, 대본 8000자 상한이면 최악 46원 — 2크레딧(20원)은 정가 전환 즉시
   * 역마진이었다. 5크레딧(50원)이면 최악에도 흑자.
   */
  videoAnalysis: 5,
} as const;

/**
 * 무료 플랜 전용 — 기능별 월 한도. 유료 플랜은 이 표를 쓰지 않고
 * PLAN_CREDIT_ALLOWANCE(통합 크레딧) 하나로 관리한다(2026-08-14 4차 개편).
 *
 * board_saves는 실제로 chargeGeneration을 호출하는 곳이 코드에 없다 — 게이팅되지
 * 않는 예약 설정이다. 나중에 보드 저장에 상한을 붙일 때 값만 살려 쓴다.
 */
export const FREE_MONTHLY_LIMITS: Record<string, number> = {
  ai_cardnews: 0,
  growth_diagnosis: 0,
  // "개인 수집"(구형 runCollection)과 "실시간 풀 수집"(collectPoolNow)이 이 계량기를 공유한다.
  reference_collect: 1,
  ad_collect: 1,
  reference_transcript: 1,
  ai_ideas: 0,
  ai_brand_tone: 0,
  ai_agent_chat: 3,
  // 2026-08-14 사장님 확정: 무료는 새 분석 월 1회 (캐시 히트는 횟수 미차감·무료)
  ai_video_analysis: 1,
  board_saves: 20, // 미사용(연결 안 됨) — 위 설명 참고
  /* 콘텐츠 분석(내 게시물 1건) — 무료 월 10회. DB free_plan_limits 와 **같이** 움직여야 한다(0047·0065).
     유료 플랜은 이 계량기를 타지 않는다(단가 미정 — 정해지면 CREDIT_COSTS 로 옮긴다) */
  content_analysis: 10,
};

/**
 * 유료 플랜 월 크레딧 지급량 — 플랜별 기능 한도를 크레딧으로 환산한 값
 * (한도 × CREDIT_COSTS 합산). 최악 원가 상한 = 지급 크레딧 × 10원.
 */
export const PLAN_CREDIT_ALLOWANCE: Record<PaidPlan, number> = {
  creator: 460,
  pro: 1260,
  agency: 4260,
  enterprise: 10550,
};

/**
 * "이 크레딧으로 무엇을 몇 번 하나" 환산 — **한 기능에 몰아 썼을 때의 최대치**다.
 * 요금제 페이지·설정 화면이 각자 계산하면 반올림 방향이 갈려 숫자가 어긋난다
 * (10,550 ÷ 4 = 2,637.5 → floor 2,637 vs round 2,638). 이 헬퍼 하나만 쓴다.
 */
export function creditsBuy(allowance: number, cost: number): number {
  if (cost <= 0) return 0;
  return Math.floor(allowance / cost);
}
