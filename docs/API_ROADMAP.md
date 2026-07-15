# API 연동 로드맵 — 종류별 스텝바이스텝

각 API가 무엇을 채우는지, 발급 절차, 코드 연동 지점을 순서대로 정리한 문서.
페이지는 전부 `lib/data/index.ts`를 바라보므로, 연동이 끝날 때마다 그 파일의 해당 export만 실제 소스로 교체하면 화면이 채워진다.

진행 순서 요약 (앞 번호일수록 먼저):

| 순서 | API | 채워지는 화면 | 심사 필요 | 예상 소요 |
|---|---|---|---|---|
| 1 | Supabase (Auth+DB) | 로그인, 알림·리포트·사용량 | 없음 | 반나절 |
| 2 | Anthropic Claude API | AI 스튜디오, AI 에이전트 | 없음 | 반나절~1일 |
| 3 | Meta 개발자 앱 | 대시보드·오디언스·분석(IG), 경쟁사 광고, 광고 관리 | 있음 (수일~수주) | 신청 즉시 시작 권장 |
| 4 | Threads API | Threads 지표 | Meta 앱에 포함 | 3과 병행 |
| 5 | TikTok for Developers | TikTok 지표 | 있음 (수주) | 신청만 미리 |
| 6 | 3rd party 트렌드 데이터 | 탐색(트렌드·검색), 타계정 정밀 | 계약 | Phase 2 |
| 7 | Toss Payments | 요금제 결제 | 계약 심사 | 출시 직전 |

---

## 1. Supabase — 인증 + 데이터베이스 (선행 조건: 무료 슬롯 확보 또는 Pro 결제)

**채우는 것**: Google/카카오 로그인 실동작, `notifications`·`reports`·`usageStats`·경쟁사 등록 목록 등 서비스 내부 데이터 전부.

1. https://supabase.com/dashboard 에서 새 프로젝트 생성 (무료 슬롯이 없으면 기존 프로젝트 하나 일시정지 후 생성)
2. **DB 스키마 마이그레이션 적용 — 이미 작성 완료**: `supabase/migrations/0001_core.sql`~`0003_functions.sql` (users_profile·connected_accounts·usage_counters·notifications·reports·auto_dm_*·use_quota 함수, RLS 포함). 적용 순서·방법은 `supabase/README.md`.
3. Google/Kakao 로그인 키 발급·등록 — 상세 절차는 `docs/AUTH_SETUP.md` 체크리스트 그대로
4. `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 입력 → 로그인 즉시 동작 (코드 수정 불필요)
5. `lib/data/index.ts`의 내부 데이터 export를 Supabase 조회로 교체 (competitors·competitor_ads_snapshot 등 채널/광고 테이블은 해당 API 연동 시 추가 마이그레이션)

## 2. Anthropic Claude API — AI 기능 (심사 불필요, 가장 빨리 "진짜"가 되는 기능)

**채우는 것**: AI 스튜디오 카드뉴스 카피 생성·아이디어 추천, AI 에이전트 챗 실응답, (추후) 댓글 감성분석.

1. https://console.anthropic.com 가입 → API Keys에서 키 발급 → 결제 수단 등록 (사용량 과금, 소액 크레딧으로 시작 가능)
2. `.env.local`에 `ANTHROPIC_API_KEY=` 추가 (서버 전용 — NEXT_PUBLIC 금지)
3. (Claude Code 작업) `/api/ai/*` 라우트 생성: 카드뉴스 카피 생성, 아이디어 추천, 에이전트 대화(function calling으로 내부 기능 호출)
4. 비용 가드: 라우트에 사용량 카운터(플랜별 한도) + rate limit 적용 — PRD 13.4

## 3. Meta 개발자 앱 — 인스타그램 + 경쟁사 광고 + 광고 관리 (가장 중요, 심사 리드타임 김)

**채우는 것**: `accounts`·`dashboardSummaries`·`recentPosts`·`audienceDaily`(인스타그램), `competitorAds`(광고 라이브러리), `campaigns`(광고 리포트).

1. 사전 준비: 비즈니스용 Facebook 계정, 서비스 도메인(임시로 Vercel 도메인 가능), 개인정보처리방침 URL(심사 필수 — 준비 중이면 초안이라도 게시)
2. https://developers.facebook.com → 앱 생성 (유형: Business)
3. 앱에 제품 추가: **Facebook 로그인**, **Instagram Graph API**
4. 앱 대시보드에 아이콘 업로드 — `public/brand/finch-app-icon-1024.png`
5. **Ad Library API**는 심사 없이 사용 가능: https://www.facebook.com/ads/library/api 에서 본인 확인 후 액세스 토큰 발급 → 경쟁사 광고 모니터링이 3단계 중 가장 먼저 실데이터로 전환 가능
6. Instagram 연동 심사(App Review): `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement` 권한 신청 — 데모 영상·사용 사유 제출 (수일~수주)
7. 광고 리포트는 Standard Access로 본인 광고 계정 조회 가능. 타사(클라이언트) 계정 관리는 Advanced Access(사업자등록증 + 비즈니스 인증) — Phase 3
8. (Claude Code 작업) OAuth 연동 플로우 + 수집 배치(하루 4회) + `lib/data` 교체

**3-확장) 인스타 댓글 자동 DM** — 이 Meta 앱에 얹는 별도 권한·웹훅:
- 추가 권한: `instagram_manage_messages`(business_manage_messages) + `instagram_manage_comments` — **별도 앱 심사·사업자 인증 필요(수주~수개월), 조기 병행 신청**
- 댓글 웹훅 구독 + `app/api/webhooks/instagram` 라우트(서명검증은 이미 스캐폴드 완료) → 매칭 댓글만 큐잉 → Private Reply 발송
- 하드 제약: 댓글당 비공개 답장 **1회·7일**, 계정당 레이트리밋, 토큰 60일 만료
- 법률: 정보통신망법(광고성 정보 동의·(광고) 표기·수신거부·야간), 개인정보보호법(수탁자 DPA)
- **착수 전 반드시 [docs/AUTO_DM_COST_RISK.md](AUTO_DM_COST_RISK.md) 정독** — 비용(Inngest 실행량·Supabase 컴퓨트)·정책·운영 체크리스트

## 4. Threads API — Meta 앱에 포함

1. 3번 Meta 앱에 **Threads API** 제품 추가, `threads_basic`, `threads_manage_insights` 권한 신청
2. 나머지는 3번과 동일한 흐름 — 별도 앱 불필요

## 5. TikTok for Developers

**채우는 것**: TikTok `accounts`·게시물 지표. (타계정/트렌드는 공식 API 미지원 — 6번으로 해결)

1. https://developers.tiktok.com → 앱 등록 (서비스 소개, 도메인, 개인정보처리방침 필요)
2. **Login Kit** + **Display API** 신청 → 심사 수주 소요, 지금 신청만 해두기
3. 승인 후 (Claude Code 작업) OAuth + 지표 수집 배치

## 6. 3rd party 트렌드 데이터 공급사 — 탐색/트렌드/타계정 정밀 (Phase 2)

**채우는 것**: `trendItems`(탐색 페이지 전체 — 검색·카테고리·실시간), 타계정 정밀 분석.

1. 소액 테스트: HikerAPI(인스타그램, 요청당 ~$0.0006)로 데이터 품질 검증
2. 본계약: EnsembleData(TikTok·IG 커버, 월 $100~) 또는 Modash — 월 예산 상한을 먼저 정할 것 (PRD 2.3)
3. (Claude Code 작업) 공급사 응답 → `TrendItem` 타입 매핑 어댑터 + 수집 배치 + `lib/data` 교체
4. 화면의 출처·갱신시점 표기는 이미 구현돼 있음 (DataSourceBadge/DataSourceNote)

## 7. Toss Payments — 결제 (출시 직전)

1. https://developers.tosspayments.com 가입 → 테스트 키로 개발 시작 가능
2. 정기(자동)결제는 별도 계약 필요 — 사업자등록증으로 신청, 심사 수일
3. (Claude Code 작업) 결제 위젯 + 웹훅(서명 검증 필수) + 플랜/사용량 연동
4. 크레딧·선불 요소가 생기면 전자금융업 해당 여부 법률 검토 (PRD 12)

---

## 지금 당장 할 일 체크리스트 (사람)

- [ ] Supabase 슬롯 확보 (기존 프로젝트 정리 또는 결제 결정)
- [ ] Anthropic API 키 발급 — 즉시 가능, 가장 빠른 성과
- [ ] Meta 개발자 앱 생성 + Ad Library 토큰 발급 — 심사 리드타임 때문에 최우선 신청
- [ ] TikTok 개발자 앱 신청 (심사 대기 병행)
- [ ] 개인정보처리방침 초안 게시 (Meta/TikTok 심사 공통 요구사항)
- [ ] Vercel 배포 (심사용 데모 URL 필요)
