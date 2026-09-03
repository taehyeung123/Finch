import type { StateTone } from "@/components/ui/state-chip";

/*
  SNS 계정 연결 — 행·요약·버튼이 **같은 답**을 내게 하는 순수 함수 둘(2026-09-03 재설계).
  전에는 배지·문장·버튼 조건이 JSX 안에 세 번 따로 적혀 있어 «배지는 연결됨인데 문장은 만료» 같은 어긋남이 있었다.
  여기서 한 번 판정하고 화면은 그대로 그린다. 실패(null)는 «미연결»이 아니라 unknown 이다.
*/

export interface ChannelCardInput {
  connected: boolean;
  handle: string;
  displayName: string | null;
  /** null = 만료 정보 없음(TikTok 은 매일 자동 갱신이라 항상 null) */
  tokenExpiresInDays: number | null;
}

export type RowAction = "connect" | "manage" | "none";
export type Tone = "sub" | "warning" | "negative";

export interface DerivedRow {
  chip: { tone: StateTone; label: string };
  hint: string | null;
  hintTone: Tone;
  meta: string | null;
  metaTone: Tone;
  action: RowAction;
}

const CHANNEL_INVITE: Record<string, string> = {
  instagram: "비즈니스·크리에이터 계정만 연결할 수 있어요",
  threads: "연결하면 게시물·답글 지표를 불러와요",
  tiktok: "연결하면 팔로워·좋아요·영상 수를 불러와요",
};

export function deriveChannelState(channel: string, card: ChannelCardInput, ready: boolean): DerivedRow {
  if (card.connected) {
    const d = card.tokenExpiresInDays;
    const who = card.displayName ? `${card.handle} · ${card.displayName}` : card.handle;
    if (d !== null && d <= 0) {
      return { chip: { tone: "bad", label: "만료됨" }, hint: who, hintTone: "sub", meta: "연결이 만료됐어요 — 다시 연결해 주세요", metaTone: "negative", action: "manage" };
    }
    if (d !== null && d <= 14) {
      return { chip: { tone: "warn", label: "만료 임박" }, hint: who, hintTone: "sub", meta: `${d}일 뒤 다시 연결이 필요해요`, metaTone: "warning", action: "manage" };
    }
    return {
      chip: { tone: "ok", label: "연결됨" },
      hint: who,
      hintTone: "sub",
      meta: channel === "tiktok" ? "팔로워·좋아요·영상 수 기준으로 집계돼요" : d !== null ? `${d}일 뒤 다시 연결` : null,
      metaTone: "sub",
      action: "manage",
    };
  }
  if (!ready) {
    return { chip: { tone: "pending", label: "준비 중" }, hint: "곧 열릴 예정이에요", hintTone: "sub", meta: null, metaTone: "sub", action: "none" };
  }
  return { chip: { tone: "off", label: "미연결" }, hint: CHANNEL_INVITE[channel] ?? "연결하면 지표를 불러와요", hintTone: "sub", meta: null, metaTone: "sub", action: "connect" };
}

export interface AdsCardInput {
  connected: boolean;
  accountCount: number;
  primaryName: string | null;
  expiresInDays: number | null;
  missingScopes: string[];
}

/** 광고 계정 — 우선순위: 확인 실패 › 미연결 › 만료 › 계정 0개 › 권한 부족 › 연결됨 (예전 배지 규칙 그대로) */
export function deriveAdsState(card: AdsCardInput | null, ready: boolean): DerivedRow {
  if (card === null) {
    return { chip: { tone: "unknown", label: "확인 못 함" }, hint: "연결 상태를 확인하지 못했어요 · 새로고침해 주세요", hintTone: "sub", meta: null, metaTone: "sub", action: "none" };
  }
  if (!card.connected) {
    return ready
      ? { chip: { tone: "off", label: "미연결" }, hint: "연결하면 캠페인 집행 금액·노출·ROAS를 볼 수 있어요", hintTone: "sub", meta: null, metaTone: "sub", action: "connect" }
      : { chip: { tone: "pending", label: "준비 중" }, hint: "곧 열릴 예정이에요", hintTone: "sub", meta: null, metaTone: "sub", action: "none" };
  }
  const d = card.expiresInDays;
  /* ⚠️ 만료일은 숨기지 않는다 — 이 연결은 자동 갱신이 안 되므로 조용히 끊기면 광고 성과가 통째로 사라진다 */
  const expiry: { meta: string | null; tone: Tone } =
    d === null
      ? { meta: null, tone: "sub" }
      : d <= 0
        ? { meta: "연결이 만료됐어요 — 다시 연결해 주세요", tone: "negative" }
        : d <= 14
          ? { meta: `${d}일 뒤 다시 연결이 필요해요`, tone: "warning" }
          : { meta: `${d}일 뒤 다시 연결이 필요해요`, tone: "sub" };
  const name = `${card.primaryName ?? "이름 없는 광고 계정"}${card.accountCount > 1 ? ` 외 ${card.accountCount - 1}개` : ""}`;
  if (d !== null && d <= 0) {
    return { chip: { tone: "bad", label: "만료됨" }, hint: name, hintTone: "sub", meta: expiry.meta, metaTone: expiry.tone, action: "manage" };
  }
  if (card.accountCount === 0) {
    return { chip: { tone: "warn", label: "광고 계정 없음" }, hint: "접근할 수 있는 광고 계정이 없어요", hintTone: "warning", meta: expiry.meta, metaTone: expiry.tone, action: "manage" };
  }
  if (card.missingScopes.length > 0) {
    return { chip: { tone: "warn", label: "다시 연결 필요" }, hint: name, hintTone: "sub", meta: "광고 만들기에 필요한 권한이 추가됐어요 — 다시 연결해 주세요", metaTone: "warning", action: "manage" };
  }
  return { chip: { tone: "ok", label: "연결됨" }, hint: name, hintTone: "sub", meta: expiry.meta, metaTone: expiry.tone, action: "manage" };
}
