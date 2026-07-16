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
