import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { PLAN_CREDIT_ALLOWANCE } from "@/lib/pricing/credit-config";
import { isPaidPlan } from "@/lib/toss/config";

/*
  크레딧 잔액·내역 조회.

  왜 필요했나: chargeGeneration 이 매 생성마다 크레딧을 깎고 credit_transactions 에
  기록까지 남기는데, **사용자가 그걸 볼 화면이 없었다.** 잔액도, 무엇에 얼마가
  나갔는지도 확인할 수 없는 상태로 과금만 되고 있었다(사이드바에 있던 「0/100회」는
  하드코딩 가짜 게이지라 2026-08-15 IA 개편에서 철거했다).

  전부 **읽기 전용**이다. 잔액을 여기서 계산하지 않는다 — users_profile.credits 가
  단일 출처고, 증감은 add_credits / deduct_my_credits / grant_plan_credits RPC 만
  한다(CLAUDE.md 크레딧 트랜잭션 원칙).

  ⚠️ 1크레딧=10원 환율은 **절대 화면에 내보내지 않는다.** 원가와 마진이 즉시 계산된다.
*/

/*
  credit_transactions.reason → 사람이 읽는 라벨.

  ⚠️ 이 표는 **실제로 코드가 넣는 문자열**과 대조해서 만든다. 기능 이름으로 추측해서
  적으면 화면에 `cardnews_generate` `plan_credits:creator` 같은 원문이 그대로 뜬다
  (2026-08-15 점검에서 실제로 그랬다 — 8개만 맞고 스튜디오 3종·환불 전부·플랜 지급이
  다 어긋나 있었다).

  reason 은 세 가지 꼴로 들어온다:
   ① 순수 키           "cardnews_generate", "agent_chat"
   ② 접두 + 콜론 꼬리  "plan_credits:creator", "collect_refund: no_sources"
   ③ 환불 접미         "<키>_fail_refund", "<키>_refund"
  그래서 아래 BASE 는 **키만** 갖고, 꼬리·접미는 labelFor 가 벗겨낸다.
  새 과금 지점을 만들면 여기 키를 같이 추가할 것.
*/
const BASE_LABELS: Record<string, string> = {
  // 스튜디오 (app/(app)/studio/actions.ts)
  cardnews_generate: "AI 카드뉴스",
  cardnews: "AI 카드뉴스",
  studio_brand_tone: "브랜드 톤 학습",
  studio_ideas: "아이디어 추천",
  // 분석
  growth_diagnosis: "성장 진단",
  diagnosis: "성장 진단",
  content_analysis: "콘텐츠 분석",
  // 챗
  agent_chat: "AI 챗",
  // 레퍼런스·광고 (lib/actions/reference.ts · ads-reference.ts · library/pool-actions.ts)
  reference_collect: "레퍼런스 수집",
  collect: "레퍼런스 수집",
  pool_collect_now: "레퍼런스 수집",
  ad_collect: "메타광고 수집",
  reference_transcript: "대본 추출",
  transcript: "대본 추출",
  pool_transcript: "대본 추출",
  pool_video_analysis: "영상 분석",
  // 지급 (lib/actions/credits.ts grantPlanCredits)
  plan_credits: "플랜 크레딧 지급",
  /* admin_gift 는 **이 레포가 만드는 값이 아니다** — 관리자 콘솔(딥레드 HQ)이
     add_credits 로 넣는다. 그래서 코드를 아무리 grep 해도 안 나오고, 실제로
     2026-08-17 프로덕션 조회로 확인하기 전까지 "admin_gift: 기능 테스트 지급"이
     화면에 원문 그대로 뜨고 있었다.
     ⚠️ 라벨 표를 코드만 보고 만들면 이 부류를 놓친다 — 반드시 실제 값을 확인할 것:
        select distinct reason from credit_transactions; */
  admin_gift: "관리자 지급",
  admin_grant: "관리자 지급",
};

/** 콜론 뒤 꼬리가 **사용자에게 의미 있는** 접두어들 (플랜명·관리자 사유) */
const TAIL_IS_MEANINGFUL = new Set(["plan_credits", "admin_gift", "admin_grant"]);

/** "generate_fail_refund" 처럼 기능명이 접두에 없고 꼬리에만 있는 예외 */
const TAIL_ONLY = new Set(["generate_fail_refund", "generate_refund"]);

function stripRefund(key: string): { base: string; refunded: boolean } {
  for (const suffix of ["_fail_refund", "_refund"]) {
    if (key.endsWith(suffix)) return { base: key.slice(0, -suffix.length), refunded: true };
  }
  return { base: key, refunded: false };
}

export function labelFor(reason: string): string {
  const raw = reason.trim();
  if (!raw) return "크레딧 변동";

  const [headRaw, ...rest] = raw.split(":");
  const head = (headRaw ?? "").trim();
  const tail = rest.join(":").trim();

  /* "generate_fail_refund: cardnews" — 기능명이 콜론 뒤에만 있다 */
  if (TAIL_ONLY.has(head) && tail) {
    const label = BASE_LABELS[stripRefund(tail).base] ?? tail;
    return `${label} 환불`;
  }

  const { base, refunded } = stripRefund(head);
  const label = BASE_LABELS[base];
  if (!label) return raw; // 모르는 키는 감추지 않고 그대로 — 원문이 디버깅 단서다

  /* 콜론 꼬리가 사유(refund why)면 굳이 안 붙인다 — 사용자에게 의미 없는 내부 코드다.
     단 플랜 지급의 꼬리는 플랜명이고, 관리자 지급의 꼬리는 관리자가 적은 사유라
     둘 다 사용자에게 정보가 된다. */
  if (TAIL_IS_MEANINGFUL.has(base) && tail) return `${label} (${tail})`;
  return refunded ? `${label} 환불` : label;
}

export interface CreditEntry {
  id: number;
  /** 음수 = 사용, 양수 = 지급·환불 */
  amount: number;
  label: string;
  createdAt: string;
}

export interface CreditSummary {
  balance: number;
  /** 이 플랜의 월 지급량. 무료 플랜이면 null (크레딧이 아니라 횟수로 제공) */
  allowance: number | null;
  /** 이번 달 사용량(양수) */
  spentThisMonth: number;
  entries: CreditEntry[];
  /**
   * 잔액·플랜을 못 읽었다 — balance 0 은 **«다 썼다»가 아니라 «모른다»**다.
   * 예전엔 이 조회의 error 를 아예 보지 않아서, 실패하면 보유 크레딧이 조용히 0으로 그려졌다.
   */
  balanceFailed: boolean;
  /** 내역·이번 달 사용량을 못 읽었다 — 빈 목록과 구분해야 한다 */
  entriesFailed: boolean;
}

const EMPTY: CreditSummary = { balance: 0, allowance: null, spentThisMonth: 0, entries: [], balanceFailed: false, entriesFailed: false };

export async function getCreditSummary(): Promise<CreditSummary> {
  /* 같은 화면의 getCurrentPlan/getSubscription/getPaymentOrders 와 같은 기준을 쓴다.
     isSupabaseConfigured 만 보면 NEXT_PUBLIC_DEMO_MODE=true(프로젝트가 죽었을 때의
     탈출구)에서 이 패널만 죽은 DB 에 접속을 시도해 탈출구를 무력화한다. */
  /* 데모는 **같은 화면의 플랜과 앞뒤가 맞아야 한다.** getCurrentPlan 이 데모에서 "creator" 를
     돌려주는데 여기서 EMPTY(allowance: null)를 주는 바람에, 결제 화면이 「현재 플랜 Creator」와
     「무료 플랜은 크레딧 대신 기능별 월 횟수로 제공됩니다 / 남은 크레딧 0」을 나란히 띄웠다(실측).
     한 화면 안에서 두 문장이 서로를 반박하면 어느 쪽도 못 믿는다. */
  if (isDemoMode()) {
    const allowance = PLAN_CREDIT_ALLOWANCE.creator;
    return {
      balance: 312,
      allowance,
      spentThisMonth: allowance - 312,
      entries: [],
      balanceFailed: false,
      entriesFailed: false,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  /* 이 조회의 error 는 예전에 버려졌다 — 실패하면 credits 가 undefined 가 되고
     화면에는 「보유 0」이 띄었다. 돈에 해당하는 숫자라 «모른다»와 구분한다. */
  const { data: profile, error: profileErr } = await supabase
    .from("users_profile")
    .select("credits, plan")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) console.error("[credits] 잔액·플랜 조회 실패:", profileErr.message);

  const plan = typeof profile?.plan === "string" ? profile.plan : "free";
  const balance = Number(profile?.credits ?? 0);
  /* 조회가 실패했으면 plan 이 "free" 로 떨어진다 — 그 값으로 allowance 를 정하면 화면 머리글이
     유료 고객에게 「무료 플랜은 크레딧 대신 횟수로 제공됩니다」라고 말한다(잔액 숫자는 이미
     «확인 못 함» 인데 설명만 단정하는 앞뒤 안 맞는 화면이 된다). 모를 땐 아무 말도 하지 않는다. */
  const balanceFailed = !!profileErr;
  const allowance = balanceFailed ? null : isPaidPlan(plan) ? PLAN_CREDIT_ALLOWANCE[plan] : null;

  /* 이번 달 기준은 **결제일이 아니라 달력 월**이다. 결제일 기준으로 하려면
     구독 시작일이 필요한데, 관리자 지급·무료 사용자에겐 그 값이 없다.
     달력 월은 누구에게나 정의되고 사용자가 암산으로 검증할 수 있다.

     ⚠️ 그 달력 월은 **KST 기준**이어야 한다. UTC 월초로 자르면 매달 두 번 틀린다:
     KST 1일 00:00~08:59 에는 아직 UTC 가 전월이라 지난달 사용량이 통째로 합산되고,
     나머지 기간에는 KST 월초 9시간에 쓴 크레딧이 누락된다. */
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const monthStart = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1) - KST_OFFSET_MS,
  ).toISOString();

  const { data: rows, error } = await supabase
    .from("credit_transactions")
    .select("id, amount, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    /* 내역을 못 읽어도 잔액은 보여준다 — 잔액이 더 중요한 정보다.
       단 spentThisMonth: 0 을 «이번 달 0 크레딧 썬»으로 읽히게 두면 안 된다 — 깃발을 달아 보람 */
    console.error("[credits] 내역 조회 실패:", error.message);
    return { balance, allowance, spentThisMonth: 0, entries: [], balanceFailed, entriesFailed: true };
  }

  const all = (rows ?? []) as Array<{ id: number; amount: number; reason: string; created_at: string }>;

  /* 이번 달 사용량은 목록 30건이 아니라 **전 기간에서 이번 달 조건**으로 따로 센다.
     30건 안에 이번 달이 다 들어온다는 보장이 없다(하루에 30번 쓸 수 있다). */
  const { data: monthRows, error: monthErr } = await supabase
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", user.id)
    .lt("amount", 0)
    .gte("created_at", monthStart);

  const spentThisMonth = ((monthRows ?? []) as Array<{ amount: number }>).reduce(
    (sum, r) => sum + Math.abs(Number(r.amount) || 0),
    0,
  );

  if (monthErr) console.error("[credits] 이번 달 사용량 조회 실패:", monthErr.message);

  return {
    balance,
    allowance,
    spentThisMonth,
    balanceFailed,
    entriesFailed: !!monthErr,
    entries: all.map((r) => ({
      id: Number(r.id),
      amount: Number(r.amount) || 0,
      label: labelFor(String(r.reason ?? "")),
      createdAt: String(r.created_at),
    })),
  };
}
