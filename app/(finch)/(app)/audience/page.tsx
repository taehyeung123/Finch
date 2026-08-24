import { redirect } from "next/navigation";

/**
 * 구 「팔로워 분석」 — 「성과 분석 · 개요」로 이동.
 * 2026-08-15 IA 개편: 분석 3개(콘텐츠 분석·팔로워 분석·성장 진단)를 「성과 분석」 하나로
 * 합쳤다. 사용자에게 3개일 이유가 없었고 셋 다 같은 인사이트 API 위에 있었다.
 * 북마크·기존 세션 링크를 위해 라우트는 남긴다.
 */
export default function Page() {
  redirect("/insights");
}
