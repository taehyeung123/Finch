# 소셜 로그인(Google + Kakao) 설정 가이드

핀치는 Supabase Auth로 Google·카카오 로그인을 처리한다. 아래 체크리스트를 순서대로 완료하면
`.env.local`에 키 두 개를 넣는 것만으로 데모 모드에서 실제 인증 모드로 전환된다.
(환경변수가 없으면 앱은 자동으로 데모 모드로 동작하므로, 설정 전에도 빌드·실행은 정상이다.)

## 1. Supabase 프로젝트 생성

- [ ] https://supabase.com/dashboard 에서 새 프로젝트 생성 (리전: Northeast Asia (Seoul) 권장)
- [ ] Project Settings > API 에서 아래 두 값을 확인해 둔다
  - Project URL — 예: `https://abcdefgh.supabase.co`
  - anon public key
- [ ] 프로젝트 URL의 호스트(`<project-ref>.supabase.co`)를 메모 — 아래 리디렉션 URI에 쓰인다

## 2. Google Cloud Console — OAuth 클라이언트

- [ ] https://console.cloud.google.com 에서 프로젝트 생성(또는 기존 선택)
- [ ] "API 및 서비스 > OAuth 동의 화면" 구성 (외부, 앱 이름/지원 이메일 입력)
- [ ] "API 및 서비스 > 사용자 인증 정보 > 사용자 인증 정보 만들기 > OAuth 클라이언트 ID"
  - 애플리케이션 유형: 웹 애플리케이션
  - 승인된 리디렉션 URI: `https://<project-ref>.supabase.co/auth/v1/callback`
- [ ] 발급된 클라이언트 ID / 클라이언트 보안 비밀번호를 메모

## 3. Kakao Developers — 앱 생성

- [ ] https://developers.kakao.com > 내 애플리케이션 > 애플리케이션 추가
- [ ] "제품 설정 > 카카오 로그인" 활성화 (ON)
- [ ] Redirect URI 등록: `https://<project-ref>.supabase.co/auth/v1/callback`
- [ ] "카카오 로그인 > 동의항목"에서 다음 항목 설정
  - 닉네임: 필수 동의
  - 카카오계정(이메일): 동의 설정 (이메일은 비즈 앱 전환 후 필수 동의 가능 — 초기엔 선택 동의로 시작)
- [ ] "앱 설정 > 앱 키"의 REST API 키 메모 (= Supabase의 Client ID)
- [ ] "제품 설정 > 카카오 로그인 > 보안"에서 Client Secret 생성 후 "사용함"으로 설정, 값 메모

## 4. Supabase 대시보드 — Providers 등록

- [ ] Authentication > Providers > Google
  - Enable 켜기, 2에서 발급한 Client ID / Client Secret 입력, 저장
- [ ] Authentication > Providers > Kakao
  - Enable 켜기, 3의 REST API 키(Client ID) / Client Secret 입력, 저장

## 5. 로컬 환경변수 작성

- [ ] 프로젝트 루트에 `.env.local` 생성 (`.env.example` 복사)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

- [ ] 개발 서버 재시작 (`npm run dev`) — NEXT_PUBLIC_ 변수는 재시작해야 반영된다

## 6. Supabase URL Configuration — 로컬 개발 허용

- [ ] Authentication > URL Configuration
  - Site URL: `http://localhost:3000`
  - Redirect URLs에 추가: `http://localhost:3000/auth/callback`
    (와일드카드를 쓰려면 `http://localhost:3000/**`)
- [ ] 배포 후에는 Site URL을 실제 도메인으로 바꾸고, Redirect URLs에 `https://<도메인>/auth/callback` 추가

## 7. 동작 확인

- [ ] `/login`에서 Google 버튼 → 구글 계정 선택 → `/dashboard`로 복귀하는지 확인
- [ ] `/login`에서 카카오 버튼 → 카카오 동의 화면 → `/dashboard`로 복귀하는지 확인
- [ ] 상단바 아바타 클릭 → 이메일 표시·로그아웃 동작 확인
- [ ] 로그아웃 상태에서 `/dashboard` 접근 시 `/login`으로 리다이렉트되는지 확인
