"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon, KakaoIcon } from "@/components/icons/provider-icons";

export interface LoginIdentity {
  provider: string;
  email: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
}

type Provider = "google" | "kakao";

const PROVIDERS: ReadonlyArray<{ key: Provider; label: string; Icon: typeof GoogleIcon; tile: string }> = [
  { key: "google", label: "Google", Icon: GoogleIcon, tile: "border border-line bg-body" },
  { key: "kakao", label: "카카오", Icon: KakaoIcon, tile: "bg-kakao text-on-kakao" },
];

/*
  연결·해제는 **브라우저에서** Supabase 를 직접 부른다 — linkIdentity 는 OAuth 인가 화면으로
  전체 페이지를 내보내는 동작이라 서버 액션으로 감쌀 수 없고(브라우저가 나가야 한다),
  unlinkIdentity 는 세션 토큰으로 본인 identity 만 지우므로 서버를 거칠 이유가 없다.

  ⚠️ Supabase 는 «수동 연결» 이 대시보드에서 꺼져 있으면 linkIdentity 를 거절한다
  (manual_linking_disabled). 그 상태를 사용자에게 «지금은 할 수 없다»로만 말하고,
  운영자용 안내는 docs/AUTH_SETUP.md E절에 둔다 — 고객 화면에 설정 이름을 적지 않는다.

  마지막 하나는 뗄 수 없다 — 떼는 순간 로그인할 방법이 없어진다. 버튼을 아예 그리지 않고
  문장으로 이유를 적는다(비활성 버튼 + hover 툴팁은 모바일에서 읽을 수 없다).
*/
function describeError(e: { code?: string; message?: string } | null): string {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "manual_linking_disabled" || /manual linking/i.test(msg)) {
    return "지금은 계정 연결을 할 수 없어요. 잠시 후 다시 시도하거나 고객센터로 문의해 주세요.";
  }
  if (code === "identity_already_exists" || /already linked/i.test(msg)) {
    return "이 계정은 이미 다른 핀치 계정에 연결돼 있어요. 그 계정으로 로그인해 주세요.";
  }
  if (code === "single_identity_not_deletable" || /at least 1 identity/i.test(msg)) {
    return "마지막 남은 로그인 방식은 해제할 수 없어요.";
  }
  return "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function LoginLinksClient({ identities, demo }: { identities: LoginIdentity[]; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [confirming, setConfirming] = useState<Provider | null>(null);
  const [notice, setNotice] = useState<{ tone: "negative" | "warning"; text: string } | null>(null);

  const linkedCount = identities.length;

  async function link(provider: Provider) {
    if (demo) {
      setNotice({ tone: "warning", text: "지금은 예시 화면이라 계정을 연결할 수 없어요. 로그인 후 이용해 주세요." });
      return;
    }
    setBusy(provider);
    setNotice(null);
    /* 콜백은 로그인과 같은 /auth/callback 이다 — code 교환이 곧 연결 완료다.
       next 는 same-origin 검증을 통과하는 앱 경로만 받는다(콜백 라우트 규칙). */
    const next = `/settings/logins?linked=${provider}`;
    const { error } = await createClient().auth.linkIdentity({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setNotice({ tone: "negative", text: describeError(error) });
      setBusy(null);
    }
    /* 성공이면 브라우저가 인가 화면으로 떠난다 — busy 는 그대로 둬 이중 클릭을 막는다 */
  }

  async function unlink(provider: Provider) {
    if (demo || linkedCount < 2) return;
    setBusy(provider);
    setNotice(null);
    const supabase = createClient();
    /* 서버가 내려준 목록은 표시용이다 — 떼려면 **지금** identity 객체가 필요하다(id·provider 를 같이 검사한다) */
    const { data, error } = await supabase.auth.getUserIdentities();
    const target = data?.identities.find((i) => i.provider === provider);
    if (error || !target) {
      setNotice({ tone: "negative", text: describeError(error) });
      setBusy(null);
      setConfirming(null);
      return;
    }
    const { error: unlinkErr } = await supabase.auth.unlinkIdentity(target);
    if (unlinkErr) {
      setNotice({ tone: "negative", text: describeError(unlinkErr) });
      setBusy(null);
      setConfirming(null);
      return;
    }
    setConfirming(null);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <p
          role={notice.tone === "negative" ? "alert" : "status"}
          className={
            notice.tone === "negative"
              ? "rounded-card border border-negative/40 bg-negative-weak p-4 text-[15px] text-negative-strong"
              : "rounded-card border border-warning/40 bg-warning-weak p-4 text-[15px] text-warning-strong"
          }
        >
          {notice.text}
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="로그인 방식"
          description={
            demo
              ? "예시 화면이에요 — 로그인하면 내 계정의 연결 상태가 표시됩니다"
              : linkedCount >= 2
                ? "두 계정이 모두 연결돼 있어요"
                : "계정을 하나 더 연결해 두면 한쪽이 막혀도 로그인할 수 있어요"
          }
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-line">
            {PROVIDERS.map(({ key, label, Icon, tile }) => {
              const identity = identities.find((i) => i.provider === key) ?? null;
              const linked = identity !== null;
              const isBusy = busy === key;
              const isConfirming = confirming === key;
              return (
                <li key={key} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-card ${tile}`}
                      aria-hidden
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-semibold">{label}</p>
                        {linked ? <Badge tone="positive">연결됨</Badge> : <Badge tone="neutral">연결 안 됨</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-[14px] text-fg-sub">
                        {linked
                          ? [
                              identity.email,
                              identity.lastSignInAt ? `마지막 로그인 ${formatDate(identity.lastSignInAt)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "연결된 계정"
                          : `${label} 계정으로도 로그인할 수 있게 연결해요`}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {!linked ? (
                        <Button variant="secondary" size="sm" onClick={() => link(key)} disabled={isBusy}>
                          {isBusy ? "이동 중…" : "연결하기"}
                        </Button>
                      ) : linkedCount >= 2 && !demo ? (
                        !isConfirming ? (
                          <Button variant="ghost" size="sm" onClick={() => setConfirming(key)} disabled={busy !== null}>
                            연결 해제
                          </Button>
                        ) : null
                      ) : null}
                    </div>
                  </div>

                  {/* 인라인 확인 — 모달 대신 그 자리에서 한 번 더 묻는다. 해제 뒤에도 다른 로그인이 남는다는 사실을 함께 적는다 */}
                  {isConfirming ? (
                    <div className="mt-3 rounded-card border border-negative/40 bg-negative-weak p-3">
                      <p className="text-[14px] text-fg">
                        {label} 로그인 연결을 해제할까요? 해제해도 다른 계정으로는 계속 로그인할 수 있어요.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="danger" size="sm" onClick={() => unlink(key)} disabled={isBusy}>
                          {isBusy ? "해제 중…" : "해제"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={isBusy}>
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {linked && linkedCount < 2 && !demo ? (
                    <p className="mt-2 text-[12px] text-fg-sub">
                      지금 유일한 로그인 방식이라 해제할 수 없어요. 다른 계정을 먼저 연결해 주세요.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
