"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileSpreadsheet, FileText, LoaderCircle, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { CHANNEL_LABEL } from "@/lib/channels";
import type { Channel, ReportItem } from "@/lib/types";
import { IS_SAMPLE_DATA } from "@/lib/data";
import { createReport } from "../actions";

type PeriodValue = "7d" | "30d" | "lastMonth" | "custom";

const PERIOD_OPTIONS: { value: PeriodValue; label: string }[] = [
  { value: "7d", label: "지난 7일" },
  { value: "30d", label: "지난 30일" },
  { value: "lastMonth", label: "지난 달" },
  { value: "custom", label: "직접 지정" },
];

const CHANNEL_ORDER: Channel[] = ["instagram", "tiktok", "threads"];

const FORMAT_LABEL: Record<ReportItem["format"], string> = {
  pdf: "PDF",
  excel: "Excel",
};

const inputClass =
  "h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg focus:outline-2 focus:outline-primary focus:outline-offset-2";

/*
  리포트 내려받기 — 맨 <a href> 가 아니라 fetch 로 받는다.
  ① 실패 응답(401·404·400)은 Content-Disposition 없는 text/plain 이라, 맨 링크면 브라우저가 **그 텍스트 문서로 이동**했다 —
     앱이 사라지고 흰 화면에 「not_found」 같은 내부 문자열이 떴다. 인스타 미연동 계정은 매번 이 길(400)이었다.
  ② 성공해도 3~5초(클릭 시점 라이브 수집 + PDF 생성) 동안 아무 티가 없었다. 끝을 아는 유일한 방법은 fetch 의 완료다
     (타이머·focus 복귀는 추측이라 거짓말을 하거나 영영 안 온다).
  전역 «이동 중» 덮개는 쓰지 않는다 — 주소가 안 바뀌어 15초 안전판까지 목록이 통째로 덮인다.
*/
const DOWNLOAD_TIMEOUT_MS = 60_000;
const DOWNLOAD_FALLBACK_ERROR = "리포트를 내려받지 못했어요. 잠시 뒤 다시 시도해 주세요.";

/* 응답 본문을 그대로 보여 주지 않는다 — 401 「unauthorized」·404 「not_found」는 내부 문자열이다.
   400 만 라우트가 고객용 한국어 문장을 준다(「인스타그램 계정을 먼저 연동해 주세요.」) — 한글이 있을 때만 쓴다. */
async function downloadErrorMessage(res: Response): Promise<string> {
  if (res.status === 401) return "로그인이 풀렸어요. 다시 로그인해 주세요.";
  if (res.status === 404) return "이 리포트를 찾을 수 없어요.";
  if (res.status === 400) {
    const text = (await res.text().catch(() => "")).trim();
    if (/[가-힣]/.test(text) && text.length <= 200) return text;
  }
  return DOWNLOAD_FALLBACK_ERROR;
}

/* 파일명은 라우트가 정한다(Content-Disposition — finch-report-YYYY-MM-DD.pdf|csv). 없으면 같은 모양으로 만든다
   — 표시용 이름이라 보안 폴백과 무관하다. 안 넣으면 blob 이름(UUID)으로 저장된다. */
function downloadFilename(header: string | null, r: ReportItem): string {
  const m = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return `finch-report-${r.createdAt.slice(0, 10)}.${r.format === "pdf" ? "pdf" : "csv"}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function ReportsClient({ initial }: { initial: ReportItem[] }) {
  const [items, setItems] = useState<ReportItem[]>(initial);
  /*
    폼은 기본으로 접는다 — 리포트를 매번 만들지는 않는데 폼이 화면 위쪽을 크게 먹어
    정작 «만들어 둔 리포트»가 아래로 밀려 있었다(2026-08-30 화면 점검).
    단 아직 하나도 없으면 열어 둔다 — 처음 온 사람은 만들러 온 것이다.
  */
  const [formOpen, setFormOpen] = useState(initial.length === 0);
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["instagram"]);
  const [format, setFormat] = useState<ReportItem["format"]>("excel");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idRef = useRef(0);
  /* 행별 잠금 — 인덱스가 아니라 r.id 로 잡는다(새 리포트가 목록 앞에 붙으면 인덱스가 밀린다).
     ref 는 같은 프레임 2연타까지 막는 동기 가드, state 는 그리기용이다. */
  const inflightRef = useRef<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [downloadErrors, setDownloadErrors] = useState<Readonly<Record<string, string>>>({});

  function setRowError(id: string, message: string | null) {
    setDownloadErrors((prev) => {
      if (message === null) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: message };
    });
  }

  function setRowBusy(id: string, busy: boolean) {
    if (busy) inflightRef.current.add(id);
    else inflightRef.current.delete(id);
    setBusyIds(new Set(inflightRef.current));
  }

  async function download(r: ReportItem) {
    if (inflightRef.current.has(r.id)) return;
    setRowBusy(r.id, true);
    setRowError(r.id, null);
    try {
      /* same-origin 이라 쿠키가 기본으로 실린다. 멈춘 요청에 버튼이 영영 잠기지 않게 60초 상한 */
      const res = await fetch(`/api/reports/${r.id}/download`, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!res.ok) {
        setRowError(r.id, await downloadErrorMessage(res));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFilename(res.headers.get("content-disposition"), r);
      document.body.appendChild(a);
      a.click();
      a.remove();
      /* 즉시 해제하면 일부 브라우저가 받기 전에 취소한다 — QR·CSV 저장과 같은 10초 지연 */
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setRowError(
        r.id,
        e instanceof DOMException && e.name === "TimeoutError"
          ? "파일을 만드는 데 너무 오래 걸리고 있어요. 잠시 뒤 다시 시도해 주세요."
          : "리포트를 내려받지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      setRowBusy(r.id, false);
    }
  }

  function toggleChannel(ch: Channel) {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  }

  function handleGenerate() {
    if (channels.length === 0 || pending) return;
    const now = new Date();
    let start: Date;
    let end: Date;
    if (period === "7d") {
      end = now;
      start = addDays(now, -6);
    } else if (period === "30d") {
      end = now;
      start = addDays(now, -29);
    } else if (period === "lastMonth") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else {
      /* 예전엔 빈 값을 조용히 now 로 메워 «2026.08.25 ~ 2026.08.25» 라는 0일짜리 리포트를 만들고,
         시작>종료도 그대로 저장했다(둘 다 실측). 채널 0개는 이미 막고 있는데 날짜만 무방비였다. */
      if (!customStart || !customEnd) {
        setError("시작일과 종료일을 모두 골라 주세요.");
        return;
      }
      start = new Date(customStart);
      end = new Date(customEnd);
      if (start.getTime() > end.getTime()) {
        setError("종료일이 시작일보다 빠를 수 없어요.");
        return;
      }
    }
    const label =
      period === "custom" ? "맞춤 기간" : PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "";
    const input = {
      title: `${label} 성과 리포트`,
      period: `${formatDate(start.toISOString())} ~ ${formatDate(end.toISOString())}`,
      channels: CHANNEL_ORDER.filter((ch) => channels.includes(ch)),
      format,
    };

    setError(null);
    startTransition(async () => {
      const res = await createReport(input);
      if (res.ok) {
        setItems((prev) => [res.report, ...prev]);
      } else if (res.demo) {
        // 데모 모드 — 로컬 미리보기 행 (저장·다운로드 없음)
        setItems((prev) => [
          { id: `local-${idRef.current++}`, ...input, createdAt: new Date().toISOString(), scheduled: false },
          ...prev,
        ]);
      } else {
        setError(res.error ?? "리포트 생성에 실패했어요.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="리포트"
        /* 「정기 발송」은 생성 폼에도 배치(cron)에도 없다 — actions.ts 가 scheduled:false 를 박아 넣는다.
           없는 기능을 있는 것처럼 말하면 「어디서 켜지?」를 찾다가 시간을 버린다. */
        description="광고주 보고용 리포트를 만들고 내려받을 수 있어요."
        action={
          /* 버튼 라벨을 상태에 맞춘다 — 폼이 기본으로 열려 있는데 라벨이 항상
             "새 리포트 만들기"라, 누르면 여는 게 아니라 닫혔다. */
          <Button
            size="sm"
            variant={formOpen ? "secondary" : "primary"}
            onClick={() => setFormOpen((v) => !v)}
          >
            {formOpen ? (
              <>
                <X className="size-4" aria-hidden />
                폼 닫기
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden />
                새 리포트 만들기
              </>
            )}
          </Button>
        }
      />

      {/* 리포트 생성 폼 (PART 4.11) */}
      {formOpen ? (
        <Card>
          <CardHeader
            title="새 리포트 만들기"
            description="기간·채널·형식을 선택하면 리포트가 목록에 추가됩니다."
          />
          <CardBody>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="report-period" className="text-[14px] font-medium text-fg-sub">
                  기간
                </label>
                <select
                  id="report-period"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as PeriodValue)}
                  className={`mt-1.5 ${inputClass}`}
                >
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {period === "custom" ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      aria-label="시작일"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      type="date"
                      aria-label="종료일"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                ) : null}
              </div>

              <fieldset>
                <legend className="text-[14px] font-medium text-fg-sub">채널</legend>
                <div className="mt-1.5 space-y-2">
                  {CHANNEL_ORDER.map((ch) => (
                    <label key={ch} className="flex items-center gap-2 text-[15px] text-fg">
                      <input
                        type="checkbox"
                        checked={channels.includes(ch)}
                        onChange={() => toggleChannel(ch)}
                        className="size-4 accent-primary"
                      />
                      {CHANNEL_LABEL[ch]}
                    </label>
                  ))}
                </div>
                {/* 지금 파일에 실제로 담기는 건 인스타그램 지표뿐이다(다운로드 라우트가
                    summaries.instagram 하나만 본다). 고를 수는 있게 두되 사실은 적어 둔다 —
                    다른 채널을 골라 놓고 파일을 열었을 때 없는 이유를 알 수 있어야 한다. */}
                <p className="mt-2 text-[12px] text-fg-sub">
                  지금은 인스타그램 지표만 파일에 담겨요. 다른 채널은 연동 후 순차로 열립니다.
                </p>
              </fieldset>

              <fieldset>
                <legend className="text-[14px] font-medium text-fg-sub">형식</legend>
                <div className="mt-1.5 space-y-2">
                  <label className="flex items-center gap-2 text-[15px] text-fg">
                    <input
                      type="radio"
                      name="report-format"
                      checked={format === "excel"}
                      onChange={() => setFormat("excel")}
                      className="size-4 accent-primary"
                    />
                    {FORMAT_LABEL.excel} (CSV)
                  </label>
                  <label className="flex items-center gap-2 text-[15px] text-fg">
                    <input
                      type="radio"
                      name="report-format"
                      checked={format === "pdf"}
                      onChange={() => setFormat("pdf")}
                      className="size-4 accent-primary"
                    />
                    {FORMAT_LABEL.pdf}
                  </label>
                </div>
              </fieldset>

              <div className="flex items-end">
                <Button onClick={handleGenerate} disabled={channels.length === 0 || pending} className="w-full">
                  {pending ? "생성 중…" : "생성하기"}
                </Button>
              </div>
            </div>
            {channels.length === 0 ? (
              <p className="mt-3 text-[14px] text-warning">채널을 1개 이상 선택해주세요.</p>
            ) : null}
            {error ? <p className="mt-3 text-[14px] text-negative">{error}</p> : null}
          </CardBody>
        </Card>
      ) : null}

      {/* 생성된 리포트 목록 (PART 4.11) */}
      <Card>
        <CardHeader title="생성된 리포트" description={`총 ${items.length}건`} />
        <CardBody>
          {items.length > 0 ? (
            <div className="divide-y divide-line">
              {items.map((r) => (
                /* 390px 에서 트레일링(형식 뱃지+다운로드)이 147~161px 로 카드 폭의 절반을 먹어
                   제목이 「6월 월간 성과 리포 / 트」로 꺾이고 기간이 3~4줄로 흩어졌다(실측).
                   좁은 화면에서는 트레일링을 **아래 줄**로 내린다. */
                <div
                  key={r.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                >
                  {/* 형식 색 — 회색 타일 하나로 PDF·엑셀이 구분되지 않았다.
                      둘은 사람들이 이미 색으로 아는 형식이라 색이 곧 정보다. */}
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-card ${
                      r.format === "pdf" ? "bg-tint-coral text-tint-coral-ink" : "bg-tint-green text-tint-green-ink"
                    }`}
                  >
                    {r.format === "pdf" ? (
                      <FileText className="size-4" aria-hidden />
                    ) : (
                      <FileSpreadsheet className="size-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold">{r.title}</p>
                      {r.scheduled ? <Badge tone="neutral">정기 발송 준비 중</Badge> : null}
                    </div>
                    <p className="tnum mt-0.5 text-[14px] text-fg-sub">
                      {/* 날짜는 부모의 text-fg-sub(5.0:1)를 상속한다 — fg-faint 는 4.0:1 라 본문 금지 토큰이다.
                          구분자만 흐리게 둔다. */}
                      {r.period} <span className="text-fg-faint">·</span> 생성일 {formatDate(r.createdAt)}
                    </p>
                  </div>
                  {/* 트레일링을 한 묶음으로 — 채널·형식·다운로드가 행마다 같은 x 에
                      정렬돼 세로로 스캔된다(앞서는 flex-wrap 이라 열이 안 맞았다). */}
                  <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                    <div className="flex items-center gap-1.5">
                      {r.channels.map((ch) => (
                        <ChannelBadge key={ch} channel={ch} />
                      ))}
                    </div>
                    <Badge tone="neutral">{r.format === "pdf" ? "PDF" : "EXCEL"}</Badge>
                  {r.id.startsWith("local-") || IS_SAMPLE_DATA ? (
                    <Button variant="secondary" size="sm" disabled title="데모 미리보기 행은 다운로드할 수 없어요">
                      <Download className="size-3.5" aria-hidden />
                      다운로드
                    </Button>
                  ) : (
                    /* href 는 남긴다 — 새 탭·주소 복사·「다른 이름으로 저장」은 브라우저 몫. 수식키·보조 버튼이면 손대지 않는다.
                       글자는 「다운로드」 고정(390px 에서 트레일링 폭이 빠듯하다 — 위 주석) — 아이콘만 회전, 설명은 행 아래 한 줄 */
                    <a
                      href={`/api/reports/${r.id}/download`}
                      onClick={(e) => {
                        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.preventDefault();
                        void download(r);
                      }}
                      aria-busy={busyIds.has(r.id) || undefined}
                      aria-disabled={busyIds.has(r.id) || undefined}
                      className={buttonClasses("secondary", "sm", busyIds.has(r.id) ? "pointer-events-none" : undefined)}
                    >
                      {busyIds.has(r.id) ? (
                        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Download className="size-3.5" aria-hidden />
                      )}
                      다운로드
                    </a>
                  )}
                  </div>
                  {busyIds.has(r.id) ? (
                    <p role="status" className="col-span-full text-right text-[12px] text-fg-sub">
                      파일을 만들고 있어요
                    </p>
                  ) : downloadErrors[r.id] ? (
                    <p role="alert" className="col-span-full break-keep text-right text-[14px] text-negative">
                      {downloadErrors[r.id]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-[15px] text-fg-sub">
              아직 생성된 리포트가 없습니다. 위에서 기간·채널을 선택해 첫 리포트를 만들어보세요.
            </p>
          )}
        </CardBody>
      </Card>

      {/* 화이트라벨 안내 (PART 4.11 — Agency 플랜) */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">화이트라벨 리포트</p>
          <p className="mt-1 text-[14px] text-fg-sub">
            대행사 로고를 넣은 화이트라벨 리포트는 Agency 플랜에서 제공됩니다.
          </p>
        </div>
        <ButtonLink href="/settings/billing" variant="secondary" size="sm">
          플랜 보기
        </ButtonLink>
      </Card>
    </div>
  );
}
