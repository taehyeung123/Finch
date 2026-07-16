# 배포 가이드 — Vercel + 가비아(finch.ai.kr) 연결 (2026 기준)

전제: GitHub `taehyeung123/Finch` 저장소, Supabase 프로젝트(`wdutrxqryvjqbufxwxem`) 생성·마이그레이션 완료.

## 1. Vercel 프로젝트 생성

1. https://vercel.com → **Continue with GitHub**로 가입/로그인 (개인 계정 프라이빗 저장소는 무료 Hobby 플랜으로 배포 가능)
2. 대시보드 우측 상단 **Add New… > Project**
3. **Import Git Repository**에서 `taehyeung123/Finch` 선택 (처음이면 GitHub 앱 권한 승인 — 해당 저장소만 허용해도 됨)
4. 설정 화면: Framework Preset = **Next.js 자동 감지**(그대로), Root Directory = `./`(그대로)

## 2. 환경변수 입력 — Deploy 누르기 "전에" 반드시

같은 화면의 **Environment Variables** 섹션에 아래를 입력한다.
NEXT_PUBLIC_ 값은 빌드 시점에 JS 번들에 박제되므로, 빼먹고 배포하면 빈 값으로 굳는다 —
나중에 추가해도 소급 적용되지 않고 **Redeploy가 필요**하다.

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wdutrxqryvjqbufxwxem.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon public 키 — `.env.local`과 동일) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 대시보드 > Project Settings > API Keys > service_role (웹훅용, 서버 전용) |

나중 단계에서 추가할 것: `IG_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`(메타 웹훅),
`NEXT_PUBLIC_NAVER_SITE_VERIFICATION`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`(서치어드바이저/서치콘솔).

5. **Deploy** 클릭 → 빌드 완료 후 `https://<프로젝트>.vercel.app`에서 사이트 확인

## 3. 도메인 추가 (Vercel 쪽 먼저)

1. 프로젝트 > **Settings > Domains** → `finch.ai.kr` 입력·추가
   - `www.finch.ai.kr`도 함께 추가 권장 (하나를 다른 쪽으로 리다이렉트 — apex를 기본으로)
2. Vercel이 **이 프로젝트 전용 DNS 값**을 보여준다 — 이 값을 그대로 쓸 것 (블로그의 옛 값 금지):
   - apex(`finch.ai.kr`): **A 레코드**, 호스트 `@`, 값은 대시보드 표시값 (현재 `216.198.79.1` — 구 76.76.21.21은 레거시)
   - `www`: **CNAME**, 값은 `xxxx.vercel-dns-0xx.com.` 형태의 프로젝트 고유값 (**끝의 점(.)까지 포함해 복사**)
   - ai.kr은 KISA 공식 2단계 도메인(Public Suffix 등재)이라 finch.ai.kr은 apex로 정상 취급된다

## 4. 가비아 DNS 설정

1. gabia.com 로그인 → **My가비아** → 이용 중인 서비스 > **도메인** → **DNS 관리툴** (직행: dns.gabia.com)
2. finch.ai.kr 옆 **설정** → **레코드 수정** → **레코드 추가**:

| 타입 | 호스트 | 값 | TTL |
|---|---|---|---|
| A | `@` | Vercel이 보여준 IP (예: 216.198.79.1) | 600 |
| CNAME | `www` | Vercel이 보여준 고유 CNAME (끝에 점 포함) | 600 |

주의:
- **호스트 칸에는 `@` 또는 `www`만** — `finch.ai.kr`을 통째로 넣으면 `www.finch.ai.kr.finch.ai.kr` 같은 레코드가 생긴다 (가비아 최다 실수)
- 기존에 `@`에 다른 A 레코드(파킹/포워딩 포함)가 있으면 **삭제** — A 레코드 2개면 Invalid Configuration
- apex(`@`)에 CNAME은 넣을 수 없다 (DNS 규칙) — A 레코드만
- TTL은 설정 중 600으로 낮게, 정상 확인 후 3600으로 올려도 됨

3. 저장 후 몇 분~수십 분 내 Vercel Domains 화면이 **Valid Configuration**으로 바뀌고 SSL(Let's Encrypt)이 자동 발급된다

## 5. 배포 후 마무리 체크리스트

- [ ] Supabase > Authentication > **URL Configuration**: Site URL = `https://finch.ai.kr`,
      Redirect URLs에 `https://finch.ai.kr/auth/callback` + `https://<프로젝트>.vercel.app/auth/callback` 추가
- [ ] https://finch.ai.kr 에서 Google/카카오 로그인 실동작 확인
- [ ] https://finch.ai.kr/sitemap.xml , /robots.txt , /llms.txt 응답 확인
- [ ] 네이버 서치어드바이저(searchadvisor.naver.com) 등록 → HTML 태그 코드 → Vercel env `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` → **Redeploy** → 소유확인 → 사이트맵 제출 + 수집 요청
- [ ] 구글 서치콘솔 동일 절차 (`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`)
- [ ] Google Auth Platform > Audience > **Publish app** (정식 오픈 시)
- [ ] 메타 앱 웹훅 콜백 `https://finch.ai.kr/api/webhooks/instagram` 등록 (docs/AUTO_DM_SETUP.md)

## 이후 자동 배포

`main`에 푸시하면 Vercel이 자동으로 재배포한다. 환경변수를 바꾼 경우에만
Deployments > 최신 배포 우측 메뉴 > **Redeploy**를 수동으로 한 번 눌러준다.
