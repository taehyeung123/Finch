# 소셜 로그인(Google + Kakao) 설정 가이드 — 2026 콘솔 기준

핀치는 Supabase Auth로 Google·카카오 로그인을 처리한다. 이 문서는 2026년 7월 현재의 콘솔 화면 기준이다
(구글은 "Google Auth Platform"으로, 카카오는 2025-07 콘솔 개편으로 구버전 블로그 경로가 전부 낡았다).

핀치 프로젝트 고정값:
- Supabase 콜백 URL: `https://wdutrxqryvjqbufxwxem.supabase.co/auth/v1/callback`
- 로컬 개발 콜백: `http://localhost:3170/auth/callback` (launch.json이 3170 포트 사용. `npm run dev` 단독 실행 시 3000)
- 운영 콜백: `https://finch.ai.kr/auth/callback`

## A. Google — Google Auth Platform

1. https://console.cloud.google.com 접속 → 상단에서 프로젝트 생성(예: "finch") 또는 기존 선택
2. 좌측 메뉴 **Google Auth Platform** (직행: https://console.cloud.google.com/auth/overview)
   - 구버전 가이드의 "API 및 서비스 > OAuth 동의 화면" 경로는 더 이상 없다
3. 처음이면 **Get started(시작하기)** 마법사:
   - 앱 정보: 앱 이름 `핀치 (Finch)`, 사용자 지원 이메일 선택
   - Audience(대상): **External(외부)** 선택
   - 연락처 정보 입력 → 약관 동의 → 완료
4. **Clients(클라이언트)** 페이지 → **Create client(클라이언트 만들기)**
   - 애플리케이션 유형: **웹 애플리케이션**, 이름 자유
   - **승인된 리디렉션 URI**: `https://wdutrxqryvjqbufxwxem.supabase.co/auth/v1/callback`
     (핀치 도메인이 아니라 Supabase 콜백을 넣는 것이 맞다. JavaScript 원본은 리다이렉트 방식엔 불필요)
5. 생성 직후 모달에서 **Client ID / Client Secret 즉시 복사** —
   2025-06 정책 변경으로 Secret 전체 값은 이 화면에서만 보인다(닫으면 마지막 4자리만). 분실 시 회전 재발급
6. Supabase 대시보드 > **Authentication > Sign In / Providers > Google** → Enable ON → ID/Secret 붙여넣고 Save
7. **Audience 페이지 > Test users**에 본인 구글 이메일 추가 — Testing 상태에선 등록된 계정만 로그인된다
   (미등록 계정은 access_denied — 코드 버그가 아님). 정식 오픈 전 같은 페이지의 **Publish app** 클릭
8. 반영이 5분~몇 시간 걸릴 수 있다 — redirect_uri_mismatch가 나면 오타 확인 후 기다릴 것

## B. Kakao — 비즈 앱 전환이 선행 필수 (최대 함정)

**왜**: Supabase 카카오 프로바이더는 이메일(account_email) 스코프를 항상 요청하는데, 일반 앱은 이메일
동의항목을 설정 자체를 못 한다(권한 없음) → 로그인 시도가 무조건 **KOE205**로 실패한다.
**해결**: "개인 개발자 비즈 앱" 전환 — 사업자등록번호 없이 셀프서비스로 즉시 된다.

1. https://developers.kakao.com → **[앱]** 메뉴 → 앱 생성 (앱 이름 `핀치`, 회사명, 카테고리)
2. **[앱] > [일반] > 앱 기본 정보**에서 **앱 아이콘 등록** (128x128, 250KB 미만 — `public/brand/finch-app-icon-*.png` 사용)
   — 아이콘이 없으면 비즈 전환이 막힌다
3. 콘솔 우측 상단 프로필 > **[계정 설정] > [본인인증]** 완료 (앱 오너 계정, 휴대폰 실명인증)
4. **[앱] > [일반] > [비즈니스 정보] > [개인 개발자 비즈 앱]** 전환 (카카오비즈니스 약관 동의 — 즉시 처리)
   - 나중에 사업자등록증이 생기면 같은 화면의 [사업자 정보 등록]으로 승급
5. **[카카오 로그인] > [사용 설정]** → 상태 **ON** (OFF면 KOE004)
6. **[앱] > [플랫폼 키] > [REST API 키]** 선택 → **[리다이렉트 URI]** 등록:
   `https://wdutrxqryvjqbufxwxem.supabase.co/auth/v1/callback` (불일치 시 KOE006)
   - 2025-07 개편으로 Redirect URI·시크릿이 [플랫폼 키] 아래로 이동했다 (구 [제품 설정]>[카카오 로그인] 아님)
7. **[카카오 로그인] > [동의항목]**:
   - 닉네임: 필수 동의 / 프로필 사진: 필수 또는 선택
   - **카카오계정(이메일): 필수 동의** — 비즈 전환 후에만 설정 가능. 핀치는 이메일 기준으로 구글 계정과
     동일 계정 연결을 하므로 선택 동의가 아니라 필수 동의로 둘 것
8. **[앱] > [플랫폼 키] > [REST API 키] > [클라이언트 시크릿]** 코드 복사
   (개편 후 새 REST API 키는 시크릿이 기본 활성화 — Supabase에 반드시 입력해야 토큰 교환이 된다)
9. Supabase 대시보드 > **Authentication > Sign In / Providers > Kakao** → Enable ON
   - Client ID = **REST API 키**, Client Secret = 8의 시크릿 코드 → Save

에러 코드 요약: KOE004 = 로그인 사용 설정 OFF / KOE006 = Redirect URI 불일치 / KOE205 = 동의항목 미설정(비즈 앱 전환 안 됨)

## C. Supabase URL Configuration

Authentication > **URL Configuration**:
- Site URL: `https://finch.ai.kr` (배포 전 임시로 `http://localhost:3170`)
- Redirect URLs에 전부 추가:
  - `http://localhost:3170/auth/callback`
  - `http://localhost:3000/auth/callback` (npm run dev 단독 실행 대비)
  - `https://finch.ai.kr/auth/callback`
  - `https://<프로젝트>.vercel.app/auth/callback` (배포 후 Vercel 기본 URL)

여기 등록되지 않은 redirectTo는 Supabase가 무시하고 Site URL로 보내버린다 — 로그인 후 엉뚱한 곳으로
떨어지면 이 목록부터 확인.

## D. 동작 확인

- `/login` → Google 버튼 → 계정 선택 → `/dashboard` 복귀 (동의 화면에 "wdutrxqryvjqbufxwxem.supabase.co로 이동" 문구가 보이는 건 정상)
- `/login` → 카카오 버튼 → 동의 화면 → `/dashboard` 복귀
- 첫 로그인 후 Supabase 대시보드 > Table Editor > `users_profile`에 행이 자동 생성됐는지 확인 (0001 트리거)
- 상단바 아바타 → 이메일 표시·로그아웃 / 로그아웃 상태에서 `/dashboard` 접근 시 `/login` 리다이렉트

배포(Vercel + 가비아 DNS)는 [`DEPLOY.md`](DEPLOY.md) 참고.
