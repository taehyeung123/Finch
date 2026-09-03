import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ExternalLink, ScrollText, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { BUSINESS, BUSINESS_PENDING, PENDING_ECOMMERCE } from "@/lib/legal/business";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/consent";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors";
import { SettingsShell } from "../_components/settings-shell";

export const metadata: Metadata = {
  title: "사업자 정보",
  robots: { index: false, follow: false },
};

/*
  사업자 정보 · 약관 및 정책 — 2026-09-03 신설(허브 항목).

  로그인한 뒤에는 마케팅 푸터가 안 보인다 — 그래서 앱 안에 사업자 정보와 약관·방침으로 가는 길이
  있어야 한다(전자상거래법 §10 표시 의무, 개인정보보호법 §30 방침 공개). 값은 전부
  lib/legal/business.ts 한 곳에서 읽는다.

  «내 동의 기록»은 0079 user_consents 다 — 언제 어떤 버전에 동의했는지 본인이 볼 수 있어야
  «동의했다»가 일방적 주장이 아니게 된다. 조회 실패는 «기록 없음»과 구분한다.
*/

interface ConsentRecord {
  over14At: string;
  termsAt: string;
  termsVersion: string;
  privacyAt: string;
  privacyVersion: string;
  marketingAt: string | null;
}

type ConsentLoad =
  | { kind: "demo" }
  | { kind: "none" }
  | { kind: "failed" }
  | { kind: "ok"; record: ConsentRecord };

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
  const r = data as {
    over14_at: string;
    terms_at: string;
    terms_version: string;
    privacy_at: string;
    privacy_version: string;
    marketing_email_at: string | null;
  };
  return {
    kind: "ok",
    record: {
      over14At: r.over14_at,
      termsAt: r.terms_at,
      termsVersion: r.terms_version,
      privacyAt: r.privacy_at,
      privacyVersion: r.privacy_version,
      marketingAt: r.marketing_email_at,
    },
  };
}

/** pending — 값이 없을 때 대신 적을 문구(항목마다 «왜 없는지»가 다르다). 없으면 대시 */
function Row({ label, value, pending }: { label: string; value: string | null; pending?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2.5">
      <dt className="w-36 shrink-0 text-[14px] text-fg-sub">{label}</dt>
      <dd className={value ? "text-[15px]" : "text-[15px] text-fg-sub"}>{value ?? pending ?? "—"}</dd>
    </div>
  );
}

const docRow =
  "group flex items-center gap-3 px-4 py-3.5 trans-state hover:bg-tint-hover focus-visible:bg-tint-hover focus-visible:outline-none";

export default async function LegalSettingsPage() {
  const consent = await loadConsent();

  return (
    <SettingsShell title="사업자 정보" description="핀치를 운영하는 사업자 정보와 약관·정책이에요.">
      <Card>
        <CardHeader title="사업자 정보" description="전자상거래법에 따라 표시하는 정보예요" />
        <CardBody className="pt-1">
          <dl className="divide-y divide-line">
            <Row label="상호" value={`${BUSINESS.company} (${BUSINESS.serviceName})`} />
            <Row label="대표자" value={BUSINESS.ceo} pending={BUSINESS_PENDING} />
            <Row label="사업자등록번호" value={BUSINESS.registrationNo} pending={BUSINESS_PENDING} />
            <Row label="법인등록번호" value={BUSINESS.corporateNo} />
            <Row label="통신판매업 신고번호" value={BUSINESS.ecommerceNo} pending={PENDING_ECOMMERCE} />
            <Row label="사업장 주소" value={BUSINESS.address} pending={BUSINESS_PENDING} />
            <Row label="대표 이메일" value={BUSINESS.contactEmail} pending={BUSINESS_PENDING} />
            <Row label="대표 전화" value={BUSINESS.phone} pending={BUSINESS_PENDING} />
            <Row label="개인정보 보호책임자" value={BUSINESS.privacyOfficer} pending={BUSINESS_PENDING} />
            <Row label="개인정보 문의" value={BUSINESS.privacyEmail} />
          </dl>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="약관 및 정책" description="앱 안에서 바로 읽을 수 있어요" />
        <ul className="mt-3 divide-y divide-line border-t border-line">
          <li>
            <Link href="/settings/legal/terms" className={docRow}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
                <ScrollText className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">이용약관</span>
                <span className="block text-[14px] text-fg-sub">시행일 {formatDate(TERMS_VERSION)} · 초안</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-fg-faint trans-state group-hover:text-fg-sub" aria-hidden />
            </Link>
          </li>
          <li>
            <Link href="/settings/legal/privacy" className={docRow}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
                <ShieldCheck className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">개인정보처리방침</span>
                <span className="block text-[14px] text-fg-sub">시행일 {formatDate(PRIVACY_VERSION)} · 초안</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-fg-faint trans-state group-hover:text-fg-sub" aria-hidden />
            </Link>
          </li>
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="내 동의 기록"
          description="가입할 때 동의한 항목과 시각이에요"
          action={
            consent.kind === "ok" ? (
              consent.record.termsVersion === TERMS_VERSION && consent.record.privacyVersion === PRIVACY_VERSION ? (
                <Badge tone="positive">현행 버전</Badge>
              ) : (
                <Badge tone="warning">재동의 필요</Badge>
              )
            ) : null
          }
        />
        <CardBody className="pt-1">
          {consent.kind === "demo" ? (
            <p className="py-2 text-[14px] text-fg-sub">예시 화면이에요 — 로그인하면 내 동의 기록이 표시됩니다.</p>
          ) : consent.kind === "failed" ? (
            <p role="alert" className="py-2 text-[14px] text-warning-strong">
              동의 기록을 불러오지 못했어요. 기록이 없는 게 아니라 잠시 못 읽은 것입니다 — 새로고침해 주세요.
            </p>
          ) : consent.kind === "none" ? (
            <p className="py-2 text-[14px] text-fg-sub">아직 기록된 동의가 없어요. 다음 방문에서 동의 화면이 다시 표시됩니다.</p>
          ) : (
            <dl className="divide-y divide-line">
              <Row label="만 14세 이상 확인" value={formatDate(consent.record.over14At)} />
              <Row
                label="이용약관 동의"
                value={`${formatDate(consent.record.termsAt)} · ${formatDate(consent.record.termsVersion)} 시행 문서`}
              />
              <Row
                label="개인정보 수집·이용 동의"
                value={`${formatDate(consent.record.privacyAt)} · ${formatDate(consent.record.privacyVersion)} 시행 문서`}
              />
              <Row
                label="마케팅 정보 수신(선택)"
                value={consent.record.marketingAt ? `동의 · ${formatDate(consent.record.marketingAt)}` : "동의하지 않음"}
              />
            </dl>
          )}
          <p className="mt-3 text-[12px] text-fg-sub">
            동의 철회는 회원 탈퇴(개인정보 화면 맨 아래) 또는 채널 연동 해제로 할 수 있어요. 마케팅 수신 동의는{" "}
            <Link href="/settings/notifications" className="underline underline-offset-2 hover:text-fg">
              알림 설정
            </Link>
            에서 언제든 바꿀 수 있어요.
          </p>
        </CardBody>
      </Card>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[14px] text-fg-sub">
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-fg"
        >
          약관 공개 페이지 <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-fg"
        >
          방침 공개 페이지 <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </p>
    </SettingsShell>
  );
}
