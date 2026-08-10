import { NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron";

/**
 * [폐기됨] 사용자별 자동 수집 크론 — 2026-08-10 중단.
 *
 * 왜 껐는가
 * ------------------------------------------------------------------
 * 이 크론은 수집 기준을 등록한 사용자마다 공급사를 호출했다. 구조상 두 가지가 깨져 있었다.
 *
 *  1) 원가가 사용자 수에 비례했다. 100명이 "다이어트"를 등록하면 같은 데이터를 100번 샀다.
 *     겹치는 키워드에서 절감이 0이었다.
 *  2) 회차당 상한이 created_at 오름차순 상위 50명이었다. 순환이 없었으므로 51번째부터는
 *     영원히 차례가 오지 않았다 — 나중에 가입한 유료 사용자가 기능을 못 받는
 *     환불 사유급 결함이었다.
 *
 * 무엇으로 대체했는가
 * ------------------------------------------------------------------
 * 공용 풀(app/api/cron/pool-*). 수집은 전원 몫으로 중앙에서 한 번만 돌고,
 * 사용자는 이미 쌓인 풀을 검색한다. 원가가 사용자 수와 분리된다.
 * 개인 수집("지금 수집" 버튼)은 그대로 살아 있다 — 사용자가 누를 때만 돈다.
 *
 * 라우트를 지우지 않고 남긴 이유: 이미 등록된 Vercel 크론이나 외부 모니터가 남아 있어도
 * 404 대신 명시적인 "꺼짐"을 받게 하려는 것이다. vercel.json 에서는 이미 제거했다.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("unauthorized", { status: 401 });
  return NextResponse.json({
    ok: true,
    retired: true,
    replacedBy: ["/api/cron/pool-plan", "/api/cron/pool-work", "/api/cron/pool-finalize"],
  });
}
