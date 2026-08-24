"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import {
  RULE_COLUMNS,
  RULE_COLUMNS_LEGACY,
  RULE_COLUMNS_NO_FOLLOW,
  missingFollowRequest,
  missingLegacyColumns,
  normalizeHttpUrl,
  ruleFromRow,
  ruleToWriteRow,
  stripFollowRequest,
  stripNewColumns,
  type AutoDmRuleRow,
} from "@/lib/auto-dm/db";
import { dmContentLimitFor } from "@/lib/auto-dm/limits";
import type { AutoDmRule, AutoDmStatus } from "@/lib/types";

/*
  자동 DM 규칙 서버 액션.

  - 데모 모드: DB 없이 성공 응답 (UI가 로컬 상태로 즉시 동작)
  - 실제 모드: getUser()로 재인증(레이아웃 가드에만 의존하지 않음) 후 auto_dm_rules CRUD.
    RLS(auth.uid() = user_id)가 소유권을 강제하고, 쿼리에도 user_id를 명시해 이중 방어한다.
  - 광고성 규칙은 서버에서 (광고)·수신거부 안내를 강제한 본문을 "저장" — 발송 경로(웹훅)도
    한 번 더 적용하지만, 저장 시점에 이미 고지된 상태가 원본이 되게 한다.
  - 플랜 게이팅(2026-08-14 개편): 발송량이 아니라 "자동화 콘텐츠(게시물) 개수"를 제한한다.
    무료 1개 — 이미 자동화된 게시물에 규칙을 더 다는 건 콘텐츠 수가 늘지 않으므로 허용.

  Instagram 전용 기능이므로 채널 개념은 두지 않는다.
*/

export type RuleActionResult = {
  ok: boolean;
  error?: string;
  rule?: AutoDmRule;
  /** 콘텐츠 개수 한도 도달 — UI가 업그레이드 안내를 띄운다 */
  limitReached?: boolean;
};

/** 규칙 입력 — 클라이언트 위저드가 보내는 직렬화 가능한 필드 */
export type RuleInput = Omit<
  AutoDmRule,
  "sentTotal" | "sentToday" | "failedTotal" | "lastSentAt" | "createdAt"
> & { createdAt?: string };

/** 서버측 최소 검증 — 잘못된 입력은 여기서 차단. URL은 normalizeHttpUrl(프로토콜 자동 보정) 기준 */
function validate(input: RuleInput): string | null {
  if (!input.postId) return "대상 게시물이 필요합니다.";
  if (!input.dmMessage.trim()) return "DM 내용이 비어 있습니다.";
  if (input.trigger === "keyword" && input.keywords.length === 0)
    return "키워드 트리거에는 키워드가 1개 이상 필요합니다.";
  if (input.buttons.length > 3) return "버튼은 최대 3개까지 넣을 수 있습니다.";
  for (const b of input.buttons) {
    if (!b.label.trim()) return "버튼명을 입력해 주세요.";
    if (!normalizeHttpUrl(b.url)) return "버튼 링크 주소를 정확히 입력해 주세요.";
  }
  if (input.dailyCap < 1) return "하루 발송 상한은 1건 이상이어야 합니다.";
  return null;
}

/**
 * 인증 가드. 데모 모드면 통과(userId null), 실제 모드면 getUser()로 재확인.
 */
async function authorize(): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: true, userId: null };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "로그인이 필요합니다." };
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, error: "인증 확인에 실패했습니다." };
  }
}

/**
 * 콘텐츠 개수 게이트 — 이 게시물이 "새 콘텐츠"이고 이미 플랜 한도만큼의 게시물에
 * 자동화가 걸려 있으면 차단. excludeRuleId는 편집 중인 규칙(자기 자신) 제외용.
 */
async function checkContentLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  targetPostId: string,
  excludeRuleId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile } = await supabase
    .from("users_profile")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  const limit = dmContentLimitFor(profile?.plan);

  const { data: rows, error } = await supabase
    .from("auto_dm_rules")
    .select("id, post_id")
    .eq("user_id", userId);
  if (error) {
    console.error("[auto-dm] 콘텐츠 수 조회 실패:", error.message);
    return { ok: false, error: "사용량 확인에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  const posts = new Set(
    (rows ?? []).filter((r) => r.id !== excludeRuleId).map((r) => r.post_id as string)
  );
  if (posts.has(targetPostId)) return { ok: true }; // 기존 콘텐츠에 규칙 추가 — 콘텐츠 수 불변
  if (posts.size >= limit) {
    return {
      ok: false,
      error:
        limit === 1
          ? "무료 플랜은 1개 콘텐츠에만 자동화를 걸 수 있어요. 플랜을 업그레이드하면 더 많은 게시물을 자동화할 수 있습니다."
          : `현재 플랜은 콘텐츠 ${limit}개까지 자동화할 수 있어요. 플랜을 업그레이드하면 한도가 늘어납니다.`,
    };
  }
  return { ok: true };
}

/** buttons/post_thumb(0038) 미적용 DB 폴백 포함 insert/update 공통 처리 */
async function writeRule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mode: "insert" | "update",
  input: RuleInput,
  userId: string,
  dmMessage: string
): Promise<{ data: AutoDmRuleRow | null; error: string | null }> {
  const row = ruleToWriteRow({ ...input, dmMessage });

  const run = async (writeRow: Record<string, unknown>, columns: string) => {
    if (mode === "insert") {
      return supabase
        .from("auto_dm_rules")
        .insert({ ...writeRow, user_id: userId })
        .select(columns)
        .single();
    }
    return supabase
      .from("auto_dm_rules")
      .update(writeRow)
      .eq("id", input.id)
      .eq("user_id", userId) // RLS와 별개로 소유권 명시 (이중 방어)
      .select(columns)
      .single();
  };

  /* 폴백은 **한 단계씩만** 내려간다 — 0052(follow_request) 하나 없다고 legacy 까지
     떨어지면 0038·0042 컬럼(buttons·post_thumb·public_replies)의 데이터가 유실된다. */
  let { data, error } = await run(row, RULE_COLUMNS);
  if (error && missingFollowRequest(error.message)) {
    ({ data, error } = await run(stripFollowRequest(row), RULE_COLUMNS_NO_FOLLOW));
  }
  if (error && missingLegacyColumns(error.message)) {
    ({ data, error } = await run(stripNewColumns(row), RULE_COLUMNS_LEGACY));
  }
  return { data: (data as unknown as AutoDmRuleRow) ?? null, error: error?.message ?? null };
}

/** 검증과 저장이 어긋나지 않게, 저장 직전 버튼을 정규화한다 — URL은 프로토콜 자동 보정 포함 */
function normalizeInput(input: RuleInput): RuleInput {
  return {
    ...input,
    buttons: input.buttons.map((b) => ({ label: b.label.trim(), url: normalizeHttpUrl(b.url) ?? b.url.trim() })),
    keywords: input.keywords.map((k) => k.trim()).filter(Boolean),
  };
}

/** DB 백스톱(0040 트리거)의 한도 예외를 사용자 안내로 변환 */
function isContentLimitDbError(message: string | null): boolean {
  return Boolean(message && message.includes("dm_content_limit"));
}

const CONTENT_LIMIT_MESSAGE =
  "이 플랜의 자동화 콘텐츠 한도에 도달했어요. 플랜을 업그레이드하면 더 많은 게시물을 자동화할 수 있습니다.";

export async function createRule(rawInput: RuleInput): Promise<RuleActionResult> {
  const invalid = validate(rawInput);
  if (invalid) return { ok: false, error: invalid };
  const input = normalizeInput(rawInput);

  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  // 광고성이면 (광고) 표기·수신거부가 포함된 본문을 저장한다 (발송 경로에서도 재적용 — 이중 방어)
  const dmMessage = applyAdDisclosure(input.dmMessage.trim(), input.isAdvertising);

  if (isDemoMode() || !auth.userId) return { ok: true };

  const supabase = await createClient();
  // 앱 게이트(친절한 안내) + 0040 트리거 백스톱(원자적 강제)의 이중 구조
  const gate = await checkContentLimit(supabase, auth.userId, input.postId, null);
  if (!gate.ok) return { ok: false, error: gate.error, limitReached: true };

  const { data, error } = await writeRule(supabase, "insert", input, auth.userId, dmMessage);
  if (error || !data) {
    if (isContentLimitDbError(error)) return { ok: false, error: CONTENT_LIMIT_MESSAGE, limitReached: true };
    console.error("[auto-dm] 규칙 생성 실패:", error);
    return { ok: false, error: "규칙 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/auto-dm");
  return { ok: true, rule: ruleFromRow(data) };
}

export async function updateRule(rawInput: RuleInput): Promise<RuleActionResult> {
  const invalid = validate(rawInput);
  if (invalid) return { ok: false, error: invalid };
  const input = normalizeInput(rawInput);

  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  const dmMessage = applyAdDisclosure(input.dmMessage.trim(), input.isAdvertising);

  if (isDemoMode() || !auth.userId) return { ok: true };

  const supabase = await createClient();
  // 편집으로 대상 게시물이 바뀌는 경우도 새 콘텐츠 추가와 같다 — 자기 자신은 제외하고 검사
  const gate = await checkContentLimit(supabase, auth.userId, input.postId, input.id);
  if (!gate.ok) return { ok: false, error: gate.error, limitReached: true };

  const { data, error } = await writeRule(supabase, "update", input, auth.userId, dmMessage);
  if (error || !data) {
    if (isContentLimitDbError(error)) return { ok: false, error: CONTENT_LIMIT_MESSAGE, limitReached: true };
    console.error("[auto-dm] 규칙 수정 실패:", error);
    return { ok: false, error: "규칙 수정에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/auto-dm");
  return { ok: true, rule: ruleFromRow(data) };
}

export async function toggleRule(id: string, next: AutoDmStatus): Promise<RuleActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (isDemoMode() || !auth.userId) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("auto_dm_rules")
    .update({ status: next })
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) {
    console.error("[auto-dm] 상태 변경 실패:", error.message);
    return { ok: false, error: "상태 변경에 실패했습니다." };
  }

  revalidatePath("/auto-dm");
  return { ok: true };
}

export async function deleteRule(id: string): Promise<RuleActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (isDemoMode() || !auth.userId) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("auto_dm_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) {
    console.error("[auto-dm] 규칙 삭제 실패:", error.message);
    return { ok: false, error: "규칙 삭제에 실패했습니다." };
  }

  revalidatePath("/auto-dm");
  return { ok: true };
}
