import type { Metadata } from "next";
import { AppLink as Link } from "@/components/ui/app-link";
import { Gavel, ReceiptText, ScrollText, ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { RetryLink } from "@/components/ui/retry-link";
import { StateChip } from "@/components/ui/state-chip";
import { formatDate } from "@/lib/format";
import { BUSINESS, BUSINESS_PENDING, PENDING_ECOMMERCE } from "@/lib/legal/business";
import { PRIVACY_VERSION, TERMS_VERSION, TERMS_MIN_ACCEPTED, evaluateConsent, koMonthDay } from "@/lib/legal/versions";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors";
import { SettingsShell } from "../_components/settings-shell";
import { FieldList, FieldRow } from "../_components/field-row";
import { SettingsGroup, SettingsRow } from "../_components/settings-row";

export const metadata: Metadata = {
  title: "사업자 정보",
  robots: { index: false, follow: false },
};

/*
  사업자 정보 · 약관 및 정책 — 2026-09-03 신설 → 같은 날 재설계(사실 행 + 문서 행).
  로그인한 뒤에는 마케팅 푸터가 안 보인다 — 그래서 앱 안에 사업자 정보와 약관·방침으로 가는 길이 있어야 한다
  (전자상거래법 §10 표시 의무, 개인정보보호법 §30 방침 공개). 값은 전부 lib/legal/business.ts 한 곳에서 읽는다.
  «내 동의 기록»은 0079 user_consents — 조회 실패는 «기록 없음»과 구분한다.
*/

interface ConsentRecord {
  over14At: string;
  termsAt: string;
  termsVersion: string;
  privacyAt: string;
  privacyVersion: string;
  marketingAt: string | null;
}

type ConsentLoad = { kind: "demo" } | { kind: "none" } | { kind: "failed" } | { kind: "ok"; record: ConsentRecord };

async function loadConsent(): Promise<ConsentLoad> {
  if (isDemoMode()) return { kind: "demo" };
  const user = await getAuthUser();
  if (!user) return { kind: "none" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_consents")
    .select("over14_at, terms_at, terms_version, privacy_at, privacy_version, marketing_email_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    /* 0079 미적용 — 표가 없으면 기록도 없다(실패가 아니다) */
    if (isMissingTableError(error)) return { kind: "none" };
    console.error("[legal] 동의 기록 조회 실패:", error.message);
    return { kind: "failed" };
  }
  if (!data) return { kind: "none" };
  const r = data as { over14_at: string; terms_at: string; terms_version: string; privacy_at: string; privacy_version: string; marketing_email_at: string | null };
  return {
    kind: "ok",
    record: { over14At: r.over14_at, termsAt: r.terms_at, termsVersion: r.terms_version, privacyAt: r.privacy_at, privacyVersion: r.privacy_version, marketingAt: r.marketing_email_at },
  };
}

function Mail({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className="underline underline-offset-2 hover:text-fg">
      {address}
    </a>
  );
}

export default async function LegalSettingsPage() {
  const consent = await loadConsent();
  /* «현행» 판정은 동의 게이트와 같은 함수(evaluateConsent)로 — 두 곳이 다른 규칙을 쓰면 «현행»이라면서 동의 화면이 뜬다 */
  const status = consent.kind === "ok" ? evaluateConsent(consent.record) : null;

  return (
    <SettingsShell title="사업자 정보" description="핀치를 운영하는 사업자 정보와 약관·정책이에요.">
      <FieldList id="business" label="사업자 정보" description="전자상거래법에 따라 표시하는 정보예요.">
        <FieldRow label="상호" value={`${BUSINESS.company} (${BUSINESS.serviceName})`} />
        <FieldRow label="대표자" value={BUSINESS.ceo ?? undefined} empty={BUSINESS_PENDING} />
        <FieldRow label="사업자등록번호" value={BUSINESS.registrationNo ?? undefined} empty={BUSINESS_PENDING} tnum />
        <FieldRow label="통신판매업 신고번호" value={BUSINESS.ecommerceNo ?? undefined} empty={PENDING_ECOMMERCE} tnum />
        <FieldRow label="사업장 주소" value={BUSINESS.address ?? undefined} empty={BUSINESS_PENDING} />
        <FieldRow label="대표 이메일" value={BUSINESS.contactEmail ? <Mail address={BUSINESS.contactEmail} /> : undefined} empty={BUSINESS_PENDING} />
        <FieldRow label="대표 전화" value={BUSINESS.phone ?? undefined} empty={BUSINESS_PENDING} tnum />
        <FieldRow label="개인정보 보호책임자" value={BUSINESS.privacyOfficer ?? undefined} empty={BUSINESS_PENDING} />
        <FieldRow label="개인정보 문의" value={<Mail address={BUSINESS.privacyEmail} />} />
        <FieldRow label="호스팅서비스 제공자" value={BUSINESS.hostingProvider} />
      </FieldList>

      <SettingsGroup id="docs" label="약관 및 정책">
        <SettingsRow href="/settings/legal/terms" icon={ScrollText} label="이용약관" hint={`시행 ${formatDate(TERMS_VERSION)}`} />
        <SettingsRow href="/settings/legal/operation" icon={Gavel} label="운영정책" hint={`시행 ${formatDate(TERMS_VERSION)} · 이용약관의 일부`} />
        <SettingsRow href="/settings/legal/refund" icon={ReceiptText} label="환불정책" hint="청약철회·환불 기준과 계산 예시" />
        <SettingsRow href="/settings/legal/privacy" icon={ShieldCheck} label="개인정보처리방침" hint={`시행 ${formatDate(PRIVACY_VERSION)}`} />
      </SettingsGroup>

      <FieldList
        id="consent"
        label="내 동의 기록"
        description="가입할 때 동의한 항목과 시각이에요."
        aside={
          status === "ok" ? (
            <StateChip tone="ok">현행</StateChip>
          ) : status === "pending" ? (
            <StateChip tone="warn">{koMonthDay(TERMS_MIN_ACCEPTED)}부터 새 약관</StateChip>
          ) : status === "missing" ? (
            <StateChip tone="warn">재동의 필요</StateChip>
          ) : undefined
        }
        footer={
          consent.kind === "demo" ? (
            <p className="px-4 py-4 text-[14px] text-fg-sub">지금은 예시 화면이라 동의 기록이 표시되지 않아요.</p>
          ) : consent.kind === "none" ? (
            <p className="px-4 py-4 text-[14px] text-fg-sub">아직 기록된 동의가 없어요 — 다음 방문 때 동의 화면이 다시 표시돼요.</p>
          ) : consent.kind === "failed" ? (
            <p role="alert" className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-[14px] text-warning-strong">
              <span>동의 기록을 불러오지 못했어요 — 기록이 없는 게 아니라 잠시 못 읽은 거예요.</span>
              <RetryLink>다시 시도</RetryLink>
            </p>
          ) : status === "pending" ? (
            <p className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-[14px] text-fg-sub">
              <span>{koMonthDay(TERMS_MIN_ACCEPTED)}부터 바뀐 이용약관이 적용돼요. 지금 미리 동의할 수 있어요.</span>
              <ButtonLink href="/onboarding/consent" variant="secondary" size="sm">
                변경 내용 보고 동의하기
              </ButtonLink>
            </p>
          ) : undefined
        }
      >
        {consent.kind === "ok" ? (
          <>
            <FieldRow label="만 14세 이상 확인" value={formatDate(consent.record.over14At)} tnum />
            <FieldRow label="이용약관 동의" value={formatDate(consent.record.termsAt)} hint={`${formatDate(consent.record.termsVersion)} 시행 문서`} tnum />
            <FieldRow label="개인정보 수집·이용 안내 확인" value={formatDate(consent.record.privacyAt)} hint={`${formatDate(consent.record.privacyVersion)} 시행 문서`} tnum />
            <FieldRow
              label="광고성 정보 수신(선택)"
              value={consent.record.marketingAt ? `동의 · ${formatDate(consent.record.marketingAt)}` : "동의하지 않음"}
              action={
                <ButtonLink href="/settings/notifications" variant="ghost" size="sm">
                  변경
                </ButtonLink>
              }
              tnum
            />
          </>
        ) : null}
      </FieldList>

      <p className="px-1 text-[12px] text-fg-sub">
        동의 철회는 회원 탈퇴(개인정보 화면 맨 아래) 또는 SNS 계정 연결 해제로 할 수 있어요. 광고성 정보 수신 동의는{" "}
        <Link href="/settings/notifications" className="underline underline-offset-2 hover:text-fg">
          알림 설정
        </Link>
        에서 언제든 바꿀 수 있어요.
      </p>
    </SettingsShell>
  );
}
