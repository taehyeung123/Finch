"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { CHANNEL_LABEL } from "@/lib/channels";
import { reports as initialReports } from "@/lib/mock/data";
import type { Channel, ReportItem } from "@/lib/types";

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
  "h-10 w-full rounded-card border border-line bg-overlay px-3 text-[14px] text-fg focus:outline-2 focus:outline-primary focus:outline-offset-2";

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export default function ReportsPage() {
  const [items, setItems] = useState<ReportItem[]>(initialReports);
  const [formOpen, setFormOpen] = useState(true);
  const [period, setPeriod] = useState<PeriodValue>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["instagram", "tiktok"]);
  const [format, setFormat] = useState<ReportItem["format"]>("pdf");
  const idRef = useRef(0);

  function toggleChannel(ch: Channel) {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  }

  function handleGenerate() {
    if (channels.length === 0) return;
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
      start = customStart ? new Date(customStart) : now;
      end = customEnd ? new Date(customEnd) : now;
    }
    const label =
      period === "custom" ? "맞춤 기간" : PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "";
    const item: ReportItem = {
      id: `local-${idRef.current++}`,
      title: `${label} 성과 리포트`,
      period: `${formatDate(start.toISOString())} ~ ${formatDate(end.toISOString())}`,
      channels: CHANNEL_ORDER.filter((ch) => channels.includes(ch)),
      format,
      createdAt: now.toISOString(),
      scheduled: false,
    };
    setItems((prev) => [item, ...prev]);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="리포트"
        description="광고주 보고용 리포트를 자동 생성하고 정기 발송합니다."
        action={
          <Button size="sm" onClick={() => setFormOpen((v) => !v)}>
            <Plus className="size-4" aria-hidden />
            새 리포트 만들기
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
                <label htmlFor="report-period" className="text-[13px] font-medium text-fg-sub">
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
                <legend className="text-[13px] font-medium text-fg-sub">채널</legend>
                <div className="mt-1.5 space-y-2">
                  {CHANNEL_ORDER.map((ch) => (
                    <label key={ch} className="flex items-center gap-2 text-[14px] text-fg">
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
              </fieldset>

              <fieldset>
                <legend className="text-[13px] font-medium text-fg-sub">형식</legend>
                <div className="mt-1.5 space-y-2">
                  {(["pdf", "excel"] as const).map((f) => (
                    <label key={f} className="flex items-center gap-2 text-[14px] text-fg">
                      <input
                        type="radio"
                        name="report-format"
                        checked={format === f}
                        onChange={() => setFormat(f)}
                        className="size-4 accent-primary"
                      />
                      {FORMAT_LABEL[f]}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex items-end">
                <Button onClick={handleGenerate} disabled={channels.length === 0} className="w-full">
                  생성하기
                </Button>
              </div>
            </div>
            {channels.length === 0 ? (
              <p className="mt-3 text-[13px] text-warning">채널을 1개 이상 선택해주세요.</p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* 생성된 리포트 목록 (PART 4.11) */}
      <Card>
        <CardHeader title="생성된 리포트" description={`총 ${items.length}건`} />
        <CardBody>
          <div className="divide-y divide-line">
            {items.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-card border border-line bg-overlay text-fg-sub">
                  {r.format === "pdf" ? (
                    <FileText className="size-4" aria-hidden />
                  ) : (
                    <FileSpreadsheet className="size-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold">{r.title}</p>
                    {r.scheduled ? <Badge tone="primary">정기 발송</Badge> : null}
                  </div>
                  <p className="tnum mt-0.5 text-[13px] text-fg-sub">
                    {r.period} <span className="text-fg-faint">· 생성일 {formatDate(r.createdAt)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {r.channels.map((ch) => (
                    <ChannelBadge key={ch} channel={ch} />
                  ))}
                </div>
                <Badge tone="neutral">{r.format === "pdf" ? "PDF" : "EXCEL"}</Badge>
                <Button variant="secondary" size="sm">
                  <Download className="size-3.5" aria-hidden />
                  다운로드
                </Button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* 화이트라벨 안내 (PART 4.11 — Agency 플랜) */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">화이트라벨 리포트</p>
          <p className="mt-1 text-[13px] text-fg-sub">
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
