# 배포 가이드 — Vercel + 가비아(finch.ai.kr) 연결 (2026 기준)

> **대조 2026-08-31.** 아래 1~4절은 «처음 세팅할 때» 절차다. 지금은 **이미 배포돼 운영 중**이고
> 도메인·SSL·환경변수·검색엔진 등록이 전부 끝났다 — 5절 체크리스트에 현재 상태를 표시해 뒀다.

전제: GitHub `taehyeung123/Finch` 저장소, Supabase 프로젝트(`wdutrxqryvjqbufxwxem`) 생성·마이그레이션 완료.

## 1. Vercel 프로젝트 생성

1. https://vercel.com → **Continue with GitHub**로 가입/로그인
   - ⚠️ **Hobby(무료)로는 지금의 `vercel.json` 이 배포되지 않는다.** 크론이 14개(하나는 매분)이고
     Hobby 는 크론 개수·빈도에 제한이 있다. 게다가 토스 정기결제가 붙은 서비스는
     Vercel 이 상업적 이용으로 보므로 Hobby 는 약관 위반이다.
   - `npm run build` 가 `scripts/check-vercel-json.mjs` 를 돌린다. **2026-09-06 Pro 전환 완료** —
     build 스크립트에 `--pro` 가 붙어 있어 분 단위 크론(방문 집계 flush)이 통과한다. Hobby 로
     내리면 이 플래그를 떼야 배포 거부를 미리 잡는다.
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

**필수인데 위 표에 없어서 자주 빠지는 것 — 없으면 기능이 조용히 멎는다:**

| Key | 없으면 어떻게 되나 |
|---|---|
| `CRON_SECRET` | `isAuthorizedCron` 이 **무조건 false** → 크론 14개가 전부 401. 토큰 자동갱신·예약 발행·DM 재처리가 조용히 멈춘다. 방문 집계 flush 도 멈추지만 그쪽은 5분 뒤 방문자 요청이 스스로 DB 직접 경로로 내려간다 |
| `TOKEN_ENCRYPTION_KEY` | IG·Threads·TikTok **연동 콜백이 중단**된다. 사용자에겐 «연동 실패»로만 보인다. 빌링키 저장도 불가 |
| `ANTHROPIC_API_KEY` | AI 기능 전부(카드뉴스·진단·챗·AI 디자인)가 폴백으로 떨어진다 |
| `SCRAPECREATORS_API_KEY` | 공용 풀 수집이 통째로 죽는다 |
| `LINK_COOKIE_SECRET` | 서비스 롤 키로 대체 서명 → **롤 키를 교체하는 순간 모든 프로필 링크 잠금해제 쿠키가 무효** |
| `RESEND_API_KEY` | 메일이 조용히 no-op — `OWNER_EMAIL` 을 넣어도 운영 경보가 한 통도 안 간다 |
| `CHANNELS_CLOSED` | 비어 있으면 **네 채널이 전부 열려 있다**. 플랫폼이 아직 우리 앱을 일반 사용자에게 안 열어 준 기간이면 `instagram,threads,tiktok,ads` 처럼 적어 닫아 둔다 — 안 그러면 고객이 눌러 봐야 플랫폼 화면에서 막히고 돌아오지도 못해 같은 실패를 반복한다. 열릴 때마다 그 이름만 빼고 재배포. `OWNER_EMAIL` 계정은 닫혀 있어도 연결된다 |
| `NEXT_PUBLIC_SENTRY_DSN` | 오류 수집이 꺼진다 — 서버 오류·`console.error` 가 Vercel 로그에만 남고 아무도 못 본다. 소스맵까지 보려면 `SENTRY_ORG`·`SENTRY_PROJECT`·`SENTRY_AUTH_TOKEN` 도 |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | 프로필 링크 방문이 DB 에 **바로** 기록된다(기능 손실 없음). 방문당 DB 쿼리 8~10회라 트래픽이 붙으면 Supabase 부하가 먼저 온다 — 둘 다 넣으면 1분 크론 `flush-views` 가 묶어 넣는다. 무료 티어 실질 용량 ≈ 월 6~8만 방문(넘으면 그 달은 자동으로 DB 직접 기록). 체류시간 일괄 반영은 마이그레이션 **0083** 이 있어야 한 왕복이다 — 없으면 행 단위 폴백(회당 100건) |

전체 목록과 설명은 `.env.example` 이 정본이다.

### 방문 집계 버퍼(Upstash) 운영 — 2026-09-06

프로필 링크 방문·체류는 Upstash 큐(`lv:q`)에 쌓였다가 매분 크론 `/api/cron/flush-views` 가 DB 에 묶어 넣는다(`lib/links/views.ts`).
크론이 5분 넘게 안 돌거나 큐가 2만 건을 넘으면 방문자 요청이 **스스로 DB 직접 경로로 내려간다** — 통계가 멈추는 일은 없고 부하 완충만 꺼진다.

- **건강 확인**: Vercel → 프로젝트 → Settings → Cron Jobs → `flush-views` → View Logs. 응답 `{ok, inserted, dwellApplied, dropped, remaining}` —
  `remaining` 이 분마다 늘면 크론이 유입을 못 따라가는 것, `ok:false` 가 이어지면 DB 쪽 장애. Upstash 콘솔 CLI 에서 `LLEN lv:q` 로도 본다.
- **Sentry 에서 볼 제목**: «flush 중단», «방문 큐 밀림», «방문 버퍼 우회». 전부 10분에 한 번만 찍힌다(한도 보호).
- **막힘 복구**: `queue_unreadable`(읽을 수 없는 항목이 절반 이상)이면 크론이 일부러 큐를 자르지 않는다. Upstash 콘솔 CLI 에서
  `LRANGE lv:q 0 4` 로 머리를 보고, 불량이면 `LTRIM lv:q <불량 개수> -1`, 전부 버려도 되면 `DEL lv:q`. 그동안 방문자 경로는 DB 직접이라 기능 손실 없음.
- **비용**: 무료 티어 월 50만 명령. 빈 큐 크론은 분당 2명령(월 ≈8.6만). 넘으면 명령이 거부되고 코드가 60초 회로 차단 후 DB 직접 기록으로 돌아간다.
  카드를 등록한 종량제라면 콘솔에서 월 예산 상한(Max Monthly Budget)을 걸어 둘 것.

나중 단계(연동 시작 시): `IG_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `INSTAGRAM_APP_ID`,
`THREADS_APP_ID/SECRET`, `TIKTOK_CLIENT_KEY/SECRET`, 토스 키 4종,
`NEXT_PUBLIC_NAVER_SITE_VERIFICATION`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.

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

## 5. 배포 후 마무리 체크리스트 (2026-08-31 현재)

**끝난 것**

- [x] Supabase URL Configuration (Site URL·Redirect URLs)
- [x] Google/카카오 로그인 실동작
- [x] sitemap.xml · robots.txt · llms.txt
- [x] 네이버 서치어드바이저 등록·소유확인·사이트맵 제출
- [x] 구글 서치콘솔 등록
- [x] Google Auth Platform **Publish app + 브랜드 확인** — 동의화면이 핀치 이름·로고로 뜬다

**남은 것 — 전부 Meta 앱을 만든 뒤에 하는 일이다**

- [ ] 메타 앱 웹훅 콜백 `https://finch.ai.kr/api/webhooks/instagram` (docs/AUTO_DM_SETUP.md)
- [ ] **Data Deletion Instructions URL** 2개 — 메타가 요구하고 코드는 이미 있다:
      `https://finch.ai.kr/api/auth/instagram/data-deletion`,
      `https://finch.ai.kr/api/auth/threads/data-deletion`
- [ ] **연동 해제(Deauthorize) 콜백 2개** — 사용자가 메타/스레드 쪽에서 먼저 끊었을 때
      우리 DB 도 즉시 미연동으로 반영한다. 등록하지 않으면 죽은 토큰으로 지표 조회가
      매번 실패하고 예약 발행 크론이 매일 새벽 실패 알림을 보낸다.
      `https://finch.ai.kr/api/auth/instagram/deauthorize`
      `https://finch.ai.kr/api/auth/threads/deauthorize`
- [x] Vercel 플랜 확인 → Pro 면 `package.json` build 에 `--pro` 추가 (2026-09-06 Pro 전환 — build·check:vercel 둘 다 `--pro`)

## 이후 자동 배포

`main`에 푸시하면 Vercel이 자동으로 재배포한다. 환경변수를 바꾼 경우에만
Deployments > 최신 배포 우측 메뉴 > **Redeploy**를 수동으로 한 번 눌러준다.
