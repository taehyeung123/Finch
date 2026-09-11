import type { StateTone } from "@/components/ui/state-chip";
import type { AccountBusiness, AdPortfolioState } from "@/lib/ads/portfolio";

/*
  SNS 계정 연결 — 행·요약·버튼이 **같은 답**을 내게 하는 순수 함수들(2026-09-03 재설계, 09-11 «비즈니스 포트폴리오» 줄 추가).
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
      /* 정상 연결에서는 «N일 뒤 다시 연결»을 쓰지 않는다 — 인스타·스레드는 refresh-tokens 크론이 만료 15일 전에
         자동으로 연장한다. 사용자가 할 일이 없는데 달력에 적어 두게 만들었다(2026-09-09 감사). 카운트다운은 갱신이
         실패해 «만료 임박»(≤14일)으로 내려왔을 때만 보인다. */
      meta: channel === "tiktok" ? "팔로워·좋아요·영상 수 기준으로 집계돼요" : "자동으로 연장돼요",
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

/** REQUIRED_SCOPE.businessManagement 와 같은 값 — 그 모듈은 server-only 라 이 순수 모듈에서는 글자로 둔다 */
const PORTFOLIO_SCOPE = "business_management";

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
    /* 빠진 권한이 비즈니스 포트폴리오(2026-09-11 추가)뿐이면 «광고 만들기»가 막힌 게 아니다 — 광고 읽기·만들기는
       그대로 된다(관문은 기능별 스코프만 본다, lib/meta/granted-scopes.ts). 막히지 않은 것을 막혔다고 말하지 않는다. */
    const onlyPortfolio = card.missingScopes.every((s) => s === PORTFOLIO_SCOPE);
    return {
      chip: { tone: "warn", label: "다시 연결 필요" },
      hint: name,
      hintTone: "sub",
      meta: onlyPortfolio
        ? "비즈니스 포트폴리오 확인 권한이 추가됐어요 — 다시 연결해 주세요"
        : "광고 만들기에 필요한 권한이 추가됐어요 — 다시 연결해 주세요",
      metaTone: "warning",
      action: "manage",
    };
  }
  return { chip: { tone: "ok", label: "연결됨" }, hint: name, hintTone: "sub", meta: expiry.meta, metaTone: expiry.tone, action: "manage" };
}

/* ── 비즈니스 포트폴리오 줄 (2026-09-11) ───────────────────────────────── */

export interface PortfolioRow {
  hint: string;
  hintTone: Tone;
  /** hint 가 포트폴리오 **이름**인가(문장이 아니라) — 화면이 이름만 본문색으로 강조한다(«Meta 광고» 줄의 계정 이름과 같은 결) */
  hintIsName: boolean;
  meta: string | null;
  metaTone: Tone;
  /** 광고 계정이 둘 이상일 때 계정마다 어느 포트폴리오인지 — 하나면 hint 가 곧 그 계정의 답이라 null */
  perAccount: { key: string; accountName: string; portfolio: string; tone: Tone }[] | null;
  /** perAccount 에서 잘려 안 보이는 계정 수 */
  more: number;
}

const PER_ACCOUNT_MAX = 5;

function portfolioLabel(b: AccountBusiness): string {
  if (b.state === "owned") return b.name ?? "이름 없는 포트폴리오";
  return b.state === "none" ? "포트폴리오에 속하지 않은 계정" : "확인 못 함";
}

/**
 * «비즈니스 포트폴리오» 줄 — null 이면 줄을 안 그린다(연동 없음·만료·계정 0개는 바로 위 «Meta 광고» 줄이 말한다).
 * ⚠️ 모름(unknown·error)을 «포트폴리오 없음»으로 그리지 않는다. «없음»은 조회가 통한 계정(none)에만 쓴다.
 */
export function derivePortfolioRow(p: AdPortfolioState): PortfolioRow | null {
  const base = { hintIsName: false, meta: null, metaTone: "sub" as Tone, perAccount: null, more: 0 };
  if (p.state === "unavailable") return null;
  if (p.state === "scope_missing") {
    return { ...base, hint: "다시 연결하면 광고 계정이 속한 포트폴리오를 보여 드려요", hintTone: "sub" };
  }
  if (p.state === "error") {
    return { ...base, hint: "포트폴리오를 확인하지 못했어요 · 새로고침해 주세요", hintTone: "warning" };
  }
  const list = p.accounts;
  if (list.length === 0) return null;

  /* 기본 계정의 포트폴리오를 맨 앞에 — 설정의 «Meta 광고» 줄이 기본 계정 이름을 먼저 보여 준다 */
  const ordered = [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const groups: string[] = [];
  const seen = new Set<string>();
  for (const a of ordered) {
    if (a.business.state === "owned" && !seen.has(a.business.id)) {
      seen.add(a.business.id);
      groups.push(portfolioLabel(a.business));
    }
  }
  const unknown = list.filter((a) => a.business.state === "unknown").length;

  let hint: string;
  let hintTone: Tone = "sub";
  if (groups.length > 0) {
    hint = groups.length > 1 ? `${groups[0]} 외 ${groups.length - 1}곳` : groups[0];
  } else if (unknown === 0) {
    hint = "비즈니스 포트폴리오에 속하지 않은 광고 계정이에요";
  } else {
    hint = "포트폴리오를 확인하지 못했어요 · 새로고침해 주세요";
    hintTone = "warning";
  }
  /* 일부만 모를 때 — 알아낸 것은 보여 주되, 모르는 계정이 있다는 사실을 숨기지 않는다 */
  const partial = unknown > 0 && unknown < list.length;

  return {
    hint,
    hintTone,
    hintIsName: groups.length > 0,
    meta: partial ? `광고 계정 ${unknown}개는 확인하지 못했어요` : null,
    metaTone: "warning",
    perAccount:
      list.length > 1
        ? ordered.slice(0, PER_ACCOUNT_MAX).map((a) => ({
            key: a.adAccountId,
            accountName: a.accountName ?? "이름 없는 광고 계정",
            portfolio: portfolioLabel(a.business),
            tone: a.business.state === "unknown" ? ("warning" as Tone) : ("sub" as Tone),
          }))
        : null,
    more: Math.max(0, list.length - PER_ACCOUNT_MAX),
  };
}
