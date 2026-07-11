import { Clock } from "lucide-react";
import { formatAgo } from "@/lib/format";
import { MOCK_SYNCED_AT } from "@/lib/mock/data";

/**
 * 데이터 최신성·출처 고지 (PRD 4.4) — 3rd party 데이터 화면에 필수.
 * "n분 전 기준" 타임스탬프와 공급 출처를 함께 표기한다.
 */
export function DataSourceNote({
  source = "제휴 데이터 공급사",
  syncedAt = MOCK_SYNCED_AT,
}: {
  source?: string;
  syncedAt?: string;
}) {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-fg-faint">
      <Clock className="size-3" aria-hidden />
      {formatAgo(syncedAt)} 기준 · {source} 제공
    </p>
  );
}
