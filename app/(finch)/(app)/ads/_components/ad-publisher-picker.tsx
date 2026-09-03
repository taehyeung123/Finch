"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { adsWriteMessage } from "@/lib/ads/campaign-rules";
import type { FbIgAccount, FbPage } from "@/lib/meta/ads-pages";
import { loadAdPagesAction, loadPageInstagramAction, saveAdPublisherAction } from "../publisher-actions";

/*
  광고 게시 주체 고르기 — 페이지 → Instagram 계정 → 저장. 설정 채널 카드와 마법사 ② 가 같이 쓴다.

  - 목록은 열 때마다 새로 조회한다(역할·연결이 바뀐다 — 스펙 §6.2). DB 에 캐시하지 않는다.
    (모달이 열려 있는 동안의 «뒤로 가기»는 이미 받은 목록을 그대로 쓴다 — 지우면 «페이지 없음»이라는 거짓말이 된다.)
  - 실패(«확인 못 함»)·권한(«다시 연결»)·없음(«Business Suite 에서 연결»)을 다른 문구로 말한다.
  - 껍데기는 ModalShell — 포커스 트랩·Escape·저장 중 잠금(busy)을 거기서 한 번에 얻는다(슬라이스 2 소넷 점검 3건).
  - 늦게 도착한 응답은 버린다(seq) — 뒤로 갔다가 다른 페이지를 고른 뒤 옛 IG 목록이 덮어쓰지 않게.
  - 저장 성공 뒤 router.refresh() 로 서버 상태를 다시 그린다.
*/

type PagesState = { loading: boolean; pages: FbPage[]; error: string | null };
type IgState = { page: FbPage; loading: boolean; accounts: FbIgAccount[]; error: string | null };

const radioBase = "flex w-full items-center gap-3 rounded-card border px-3.5 py-3 text-left trans-state";

export function AdPublisherPicker({
  current,
  triggerLabel = "광고 페이지 선택",
  changeLabel = "게시 주체 변경",
  onSaved,
}: {
  current: { pageName: string | null; igUsername: string | null } | null;
  triggerLabel?: string;
  /** 이미 골라 둔 상태의 버튼 문구 — 설정 행처럼 좁은 자리는 «변경» */
  changeLabel?: string;
  /** 마법사 ② 가 저장 결과를 바로 반영할 때 */
  onSaved?: (v: { pageName: string; igUsername: string | null }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pagesState, setPagesState] = useState<PagesState>({ loading: false, pages: [], error: null });
  /** null = 페이지 단계 */
  const [ig, setIg] = useState<IgState | null>(null);
  const [selectedIg, setSelectedIg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const seq = useRef(0);

  async function openPicker() {
    const id = ++seq.current;
    setOpen(true);
    setIg(null);
    setSaveError(null);
    setSelectedIg(null);
    setPagesState({ loading: true, pages: [], error: null });
    const res = await loadAdPagesAction();
    if (seq.current !== id) return;
    setPagesState(res.ok ? { loading: false, pages: res.pages, error: null } : { loading: false, pages: [], error: adsWriteMessage(res.code) });
  }

  async function choosePage(page: FbPage) {
    const id = ++seq.current;
    setSaveError(null);
    setSelectedIg(null);
    setIg({ page, loading: true, accounts: [], error: null });
    const res = await loadPageInstagramAction(page.id);
    if (seq.current !== id) return;
    if (!res.ok) {
      setIg({ page, loading: false, accounts: [], error: adsWriteMessage(res.code) });
      return;
    }
    setIg({ page, loading: false, accounts: res.accounts, error: null });
    if (res.accounts.length === 1) setSelectedIg(res.accounts[0].id);
  }

  function backToPages() {
    seq.current += 1; // 늦게 오는 IG 응답을 버린다
    setIg(null);
    setSelectedIg(null);
    setSaveError(null);
  }

  async function save() {
    if (!ig || ig.loading || !selectedIg) return;
    const account = ig.accounts.find((a) => a.id === selectedIg);
    if (!account) return;
    setSaveError(null);
    setSaving(true);
    try {
      const res = await saveAdPublisherAction({ pageId: ig.page.id, igUserId: account.id });
      if (!res.ok) {
        /* 목록은 그대로 둔다 — 다른 계정으로 바꿔 다시 저장할 수 있게 */
        setSaveError(adsWriteMessage(res.code));
        return;
      }
      setOpen(false);
      onSaved?.({ pageName: res.pageName, igUsername: res.igUsername });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function close() {
    if (saving) return;
    setOpen(false);
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={openPicker}>
        {current ? changeLabel : triggerLabel}
      </Button>

      {open ? (
        <ModalShell
          label="광고 게시 주체 선택"
          title={ig ? "Instagram 계정" : "광고를 게시할 페이지"}
          description={
            ig
              ? `«${ig.page.name}» 페이지에 연결된 Instagram 계정이에요.`
              : "광고는 Facebook 페이지 이름으로 게시돼요. 광고 권한이 있는 페이지만 고를 수 있어요."
          }
          onClose={close}
          busy={saving}
          size="md"
          footer={
            <div className="flex items-center justify-between gap-2">
              {ig ? (
                <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={backToPages}>
                  ← 페이지 다시 고르기
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={close} disabled={saving}>
                  취소
                </Button>
                {ig ? (
                  <Button type="button" size="sm" onClick={save} disabled={!selectedIg || ig.loading || saving}>
                    {saving ? "저장하는 중…" : "이 계정으로 저장"}
                  </Button>
                ) : null}
              </div>
            </div>
          }
        >
          <div className="space-y-2">
            {!ig ? (
              pagesState.loading ? (
                <p className="py-6 text-center text-[14px] text-fg-sub">페이지를 불러오는 중…</p>
              ) : pagesState.error ? (
                <p role="alert" className="rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
                  {pagesState.error}
                </p>
              ) : pagesState.pages.length === 0 ? (
                <p className="rounded-card bg-plate p-3 text-[14px] text-fg-sub">
                  이 계정으로 관리하는 Facebook 페이지가 없어요. 페이지를 만들거나 역할을 받은 뒤 다시 열어 주세요.
                </p>
              ) : (
                pagesState.pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!p.canAdvertise}
                    onClick={() => choosePage(p)}
                    className={cn(
                      radioBase,
                      p.canAdvertise ? "border-line bg-body hover:border-line-strong" : "cursor-not-allowed border-line bg-plate opacity-60",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                      <span className="block text-[12px] text-fg-sub">
                        {p.canAdvertise ? "광고 권한 있음" : "이 페이지에는 광고 권한이 없어요"}
                      </span>
                    </span>
                  </button>
                ))
              )
            ) : ig.loading ? (
              <p className="py-6 text-center text-[14px] text-fg-sub">Instagram 계정을 확인하는 중…</p>
            ) : ig.error ? (
              <p role="alert" className="rounded-card bg-warning-weak p-3 text-[14px] text-warning-strong">
                {ig.error}
              </p>
            ) : (
              <div role="radiogroup" aria-label="Instagram 계정" className="space-y-2">
                {ig.accounts.map((a) => {
                  const on = selectedIg === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={saving}
                      onClick={() => setSelectedIg(a.id)}
                      className={cn(radioBase, on ? "border-primary bg-primary-weak" : "border-line bg-body hover:border-line-strong")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{a.username ? `@${a.username}` : "Instagram 계정"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {saveError ? (
              <p role="alert" className="rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
                {saveError}
              </p>
            ) : null}
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
