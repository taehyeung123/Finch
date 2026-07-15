# Supabase 스키마 — 적용 가이드

핀치의 DB 스키마 마이그레이션이다. 앱은 지금 데모 모드(목데이터)로 돌고, 아래를 적용하고 `.env.local`에 키를 넣으면 실제 DB로 전환된다.

## 적용 순서 (오늘 결제 후)

1. **프로젝트 생성**: 핀치 전용 조직을 새로 만들고 Pro로 업그레이드한 뒤, 그 조직에 프로젝트 생성 (레드랭크·뷰스코프 무료 조직은 그대로 둠).
2. **마이그레이션 실행** — 둘 중 하나:
   - **간단**: 대시보드 > SQL Editor에 `migrations/0001_core.sql` → `0002_auto_dm.sql` → `0003_functions.sql` 순서로 붙여넣고 Run.
   - **CLI**: `supabase link --project-ref <ref>` 후 `supabase db push` (파일명 순서대로 적용됨).
3. **인증 설정**: Google/Kakao 로그인 키 등록 — 절차는 [`../docs/AUTH_SETUP.md`](../docs/AUTH_SETUP.md).
4. **환경변수**: `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 입력 → 로그인·DB 즉시 동작(코드 수정 불필요, 데모 모드 자동 해제).

## 구성

| 파일 | 내용 |
|---|---|
| `0001_core.sql` | users_profile(회원가입 트리거), connected_accounts(토큰 암호화 컬럼), usage_counters, notifications, reports + RLS + updated_at 트리거 |
| `0002_auto_dm.sql` | auto_dm_rules, dm_sends(댓글당 1회 유니크 멱등), webhook_events, commenter_consent + RLS |
| `0003_functions.sql` | use_quota() 트랜잭션 한도 차감 함수 (앱 코드 직접 UPDATE 금지) |

## 원칙

- 모든 사용자 소유 테이블은 **RLS on + `auth.uid() = user_id`** 정책. 서버 전용 테이블(webhook_events)은 정책 없이 RLS on(서비스 롤만 접근).
- 채널 토큰은 **암호화 컬럼(`*_cipher`)** 에 저장 — 평문·클라이언트 노출 금지. 암호화 방식은 연동 시 확정(TODO).
- 한도 차감은 **`use_quota()`** 함수로만.
- 자동 DM 백엔드(웹훅 처리·발송·예약확정)는 API-last. 비용·정책·운영 체크리스트: [`../docs/AUTO_DM_COST_RISK.md`](../docs/AUTO_DM_COST_RISK.md).

> 적용 중 오류가 나면 해당 SQL 편집기 에러 메시지를 그대로 알려주세요 — 바로 고쳐드립니다.
