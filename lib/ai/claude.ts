import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude API 클라이언트 — 서버 전용 (ANTHROPIC_API_KEY는 절대 NEXT_PUBLIC_ 금지).
 * 키가 없으면 null을 반환하고, 호출측은 템플릿 폴백으로 동작한다 (데모 모드 원칙과 동일).
 */
export function createClaudeClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

/** AI 스튜디오 공용 모델 — 카피 품질이 곧 기능 가치라 최상위 모델 사용 */
export const STUDIO_MODEL = "claude-opus-4-8";

/**
 * 대량 보조 작업용 모델 — 레퍼런스 요약·태깅, 검색어 확장처럼 항목이 많고
 * 분류 성격인 작업. 최저가 모델로 충분한 품질이 나오는 작업이라 Haiku 고정
 * (Opus 대비 출력단가 1/5 → Haiku는 그 1/5, 속도도 최상) — 수집 1회 AI 비용을
 * 수십 원 단위로 내려 크레딧 소진과 타임아웃 위험을 같이 줄인다.
 */
export const FAST_MODEL = "claude-haiku-4-5-20251001";
