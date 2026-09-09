"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvatarImage } from "@/components/ui/avatar-image";
import { InfoTip } from "@/components/ui/info-tip";
import { ModalShell } from "@/components/ui/modal-shell";
import { ResultModal, type ResultModalContent } from "@/components/ui/result-modal";
import { StateChip } from "@/components/ui/state-chip";
import { ProviderTile } from "@/components/icons/provider-icons";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { PROVIDERS, PROVIDER_LABEL, isProvider, type Provider } from "@/lib/account/providers";
import { SettingsGroup, SettingsRow } from "../../_components/settings-row";
import { SummaryCard } from "../../_components/summary-card";

export interface LoginIdentity {
  provider: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
}

/*
  연결·해제는 **브라우저에서** Supabase 를 직접 부른다 — linkIdentity 는 OAuth 인가 화면으로 전체 페이지를 내보내는
  동작이라 서버 액션으로 감쌀 수 없고, unlinkIdentity 는 세션 토큰으로 본인 identity 만 지우므로 서버를 거칠 이유가 없다.
  ⚠️ Supabase 는 «수동 연결»이 대시보드에서 꺼져 있으면 linkIdentity 를 거절한다 — 사용자에겐 «지금은 할 수 없다»로만 말한다.
  마지막 하나는 뗄 수 없다 — 버튼 대신 «유일한 로그인» + 설명 팁.
  해제 확인은 인라인 빨간 박스가 아니라 ModalShell(파괴적 행동은 모달 — 설정 공통 규칙).
*/
/* 제목(무슨 일이 있었나)과 설명(이제 뭘 하나)으로 나눠 돌려준다 — 결과 모달이 두 줄로 그린다.
   제목에는 마침표를 찍지 않는다(ResultModal 이 접근성 이름으로도 쓴다). */
function describeError(e: { code?: string; message?: string } | null): { title: string; description?: string } {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "manual_linking_disabled" || /manual linking/i.test(msg))
    return { title: "지금은 계정 연결을 할 수 없어요", description: "잠시 후 다시 시도하거나 고객센터로 문의해 주세요." };
  if (code === "identity_already_exists" || /already linked/i.test(msg))
    return { title: "이미 다른 핀치 계정에 연결된 계정이에요", description: "그 계정으로 로그인해 주세요." };
  if (code === "single_identity_not_deletable" || /at least 1 identity/i.test(msg))
    return { title: "마지막 남은 로그인 방식은 해제할 수 없어요" };
  return { title: "처리하지 못했어요", description: "잠시 후 다시 시도해 주세요." };
}

/** 해제 확인 모달 **안**의 인라인 오류용 — 모달 위에 모달을 겹치지 않고 한 문장으로 보여준다 */
function errorSentence(e: { code?: string; message?: string } | null): string {
  const { title, description } = describeError(e);
  return description ? `${title}. ${description}` : `${title}.`;
}

export function LoginLinksClient({ identities, demo, linkedParam }: { identities: LoginIdentity[]; demo: boolean; linkedParam: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [confirming, setConfirming] = useState<Provider | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  /* 연결·해제 결과는 모달로 한 번 세운다(2026-09-09 사장님 지시 — 채널 화면과 같은 규칙).
     ?linked= 성공은 OAuth 에서 **돌아온 직후**라 첫 렌더의 초기값으로 들어온다.
     URL 청소(뒤로가기·새로고침 재표시 방지)는 ResultModal 이 path 로 맡는다. */
  const [flash, setFlash] = useState<ResultModalContent | null>(() =>
    linkedParam && isProvider(linkedParam) ? { tone: "positive", title: `${PROVIDER_LABEL[linkedParam]} 계정을 연결했어요` } : null,
  );

  const linkedCount = identities.length;

  async function link(provider: Provider) {
    if (demo) {
      setFlash({ tone: "warning", title: "지금은 예시 화면이라 계정을 연결할 수 없어요" });
      return;
    }
    setBusy(provider);
    setFlash(null);
    /* 콜백은 로그인과 같은 /auth/callback — code 교환이 곧 연결 완료. next 는 same-origin 앱 경로만 */
    const next = `/settings/logins?linked=${provider}`;
    const { error } = await createClient().auth.linkIdentity({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setFlash({ tone: "negative", ...describeError(error) });
      setBusy(null);
    }
    /* 성공이면 브라우저가 인가 화면으로 떠난다 — busy 는 그대로 둬 이중 클릭을 막는다 */
  }

  async function unlink(provider: Provider) {
    if (demo || linkedCount < 2) return;
    setBusy(provider);
    setModalError(null);
    const supabase = createClient();
    /* 서버가 내려준 목록은 표시용이다 — 떼려면 **지금** identity 객체가 필요하다 */
    const { data, error } = await supabase.auth.getUserIdentities();
    const target = data?.identities.find((i) => i.provider === provider);
    if (error || !target) {
      setModalError(errorSentence(error));
      setBusy(null);
      return;
    }
    const { error: unlinkErr } = await supabase.auth.unlinkIdentity(target);
    if (unlinkErr) {
      setModalError(errorSentence(unlinkErr));
      setBusy(null);
      return;
    }
    setConfirming(null);
    setBusy(null);
    setFlash({ tone: "positive", title: `${PROVIDER_LABEL[provider]} 연결을 해제했어요` });
    router.refresh();
  }

  const other = (p: Provider) => PROVIDERS.filter((x) => x !== p).map((x) => PROVIDER_LABEL[x]).join("·");

  return (
    <>
      <ResultModal result={flash} path="/settings/logins" onClose={() => setFlash(null)} />

      <SummaryCard
        leading={
          <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
            <KeyRound className="size-5" />
          </span>
        }
        title={
          <>
            로그인 계정 <span className="tnum">{linkedCount}</span>개 연결됨
          </>
        }
        chips={linkedCount >= 2 ? <StateChip tone="ok">예비 로그인 있음</StateChip> : <StateChip tone="todo">예비 로그인 없음</StateChip>}
        sub={
          demo
            ? "지금은 예시 화면이에요 — 연결을 바꿀 수는 없어요"
            : linkedCount >= 2
              ? "Google과 카카오 어느 쪽으로도 들어올 수 있어요"
              : "하나 더 연결해 두면 한쪽이 막혀도 들어올 수 있어요"
        }
        aside={demo ? <Badge tone="neutral">예시 화면</Badge> : undefined}
      />

      <SettingsGroup id="logins" label="로그인 계정">
        {PROVIDERS.map((key) => {
          const identity = identities.find((i) => i.provider === key) ?? null;
          const linked = identity !== null;
          const isBusy = busy === key;
          const label = PROVIDER_LABEL[key];
          const who = linked ? [identity.name, identity.email].filter(Boolean).join(" · ") || "이메일을 제공하지 않은 계정" : `연결하면 이 계정으로도 로그인할 수 있어요`;
          const meta =
            linked && (identity.createdAt || identity.lastSignInAt)
              ? [identity.createdAt ? `연결 ${formatDate(identity.createdAt)}` : null, identity.lastSignInAt ? `마지막 로그인 ${formatDate(identity.lastSignInAt)}` : null]
                  .filter(Boolean)
                  .join(" · ")
              : null;
          return (
            <SettingsRow
              key={key}
              leading={
                linked && identity.avatarUrl ? (
                  <span className="relative shrink-0">
                    <AvatarImage src={identity.avatarUrl} initial={(identity.name || identity.email || label).charAt(0).toUpperCase()} sizeClass="size-10" textClass="text-[15px]" />
                    <ProviderTile provider={key} size={18} className="absolute -bottom-1 -right-1 border-2 border-body" />
                  </span>
                ) : (
                  <ProviderTile provider={key} size={40} />
                )
              }
              label={label}
              chip={linked ? <StateChip tone="ok">연결됨</StateChip> : <StateChip tone="off">연결 안 됨</StateChip>}
              hint={who}
              meta={meta}
              busy={isBusy}
              trailing={
                demo ? null : !linked ? (
                  <Button variant="primary" size="sm" onClick={() => link(key)} disabled={isBusy} aria-busy={isBusy}>
                    {isBusy ? "이동 중…" : "연결하기"}
                  </Button>
                ) : linkedCount >= 2 ? (
                  <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirming(key)}>
                    연결 해제
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-sub">
                    유일한 로그인
                    <InfoTip label="해제 안내">마지막 남은 로그인 계정은 해제할 수 없어요. 다른 계정을 먼저 연결하면 해제 버튼이 생겨요.</InfoTip>
                  </span>
                )
              }
            />
          );
        })}
      </SettingsGroup>

      {confirming ? (
        <ModalShell
          label="로그인 연결 해제"
          title={`${PROVIDER_LABEL[confirming]} 연결을 해제할까요?`}
          size="sm"
          busy={busy === confirming}
          onClose={() => {
            if (busy) return;
            setConfirming(null);
            setModalError(null);
          }}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => { setConfirming(null); setModalError(null); }}>
                취소
              </Button>
              <Button variant="danger" size="sm" disabled={busy !== null} onClick={() => unlink(confirming)}>
                {busy === confirming ? "해제 중…" : "해제"}
              </Button>
            </div>
          }
        >
          <p className="text-[15px] leading-relaxed text-fg-sub">
            해제하면 {PROVIDER_LABEL[confirming]} 계정으로는 로그인할 수 없어요. {other(confirming)} 계정으로는 계속 들어올 수 있어요.
          </p>
          {modalError ? (
            <p role="alert" className="mt-3 text-[14px] text-negative-strong">
              {modalError}
            </p>
          ) : null}
        </ModalShell>
      ) : null}
    </>
  );
}
