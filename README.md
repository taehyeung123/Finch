# 핀치 (Finch)

AI SNS 통합 분석 & 메타광고 관리 플랫폼.

인스타그램·틱톡·쓰레드 3개 채널의 데이터를 한곳에서 분석하고, 메타광고 집행까지 관리하는 통합 SaaS입니다. 기능 명세와 디자인 시스템은 [PRD.md](./PRD.md)를 참고하세요.

## 기술 스택

- Next.js 16 (App Router, Turbopack) + TypeScript
- Tailwind CSS v4 — 다크모드 전용 디자인 토큰 (`app/globals.css`)
- lucide-react 아이콘, 자체 SVG 차트 컴포넌트

## 시작하기

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인할 수 있습니다.

## 프로젝트 구조

```
app/
  (marketing)/   랜딩페이지, 요금제 — 공개·SEO 대상
  (auth)/        로그인, 회원가입, 온보딩 (목 인증)
  (app)/         대시보드 전체 — 사이드바 레이아웃, noindex
components/
  ui/            공통 UI (버튼, 카드, 배지, 차트 등)
  layout/        앱 셸 (사이드바, 상단바, AI 에이전트 패널)
  landing/       랜딩페이지 섹션
lib/
  types.ts       공용 타입
  mock/data.ts   목데이터 레이어 (실제 API 연동 전까지 사용)
```

## 현재 상태

- Phase 1 UI 구현 중 — 전 화면 목데이터 기반
- 실제 API 연동(Meta/TikTok/Threads OAuth, Ad Library, 결제)은 이후 단계
