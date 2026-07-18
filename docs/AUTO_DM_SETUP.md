# 인스타 댓글 자동 DM — 실발송 연동 가이드 (사람 작업 체크리스트)

코드 파이프라인은 완성돼 있다: 웹훅 수신(서명검증) → 규칙 매칭 → 멱등 예약(중복·하루상한·옵트아웃·24h 쿨다운·월한도) → Private Reply 발송 → 결과 확정. 이 문서는 그 파이프라인에 **Meta 쪽 스위치를 켜는 사람 작업**을 순서대로 정리한다.

전제: Supabase 프로젝트 생성 + 마이그레이션 0001~0004 적용 + 배포(https://finch.ai.kr) 완료.

## 1. Meta 개발자 앱 준비

1. https://developers.facebook.com → 앱 생성(유형: Business) — 이미 만들었다면 그 앱 재사용 (`docs/API_ROADMAP.md` 3번)
2. 제품 추가: **Messenger** 또는 **Instagram** 제품에서 Instagram 메시지 설정 활성화
3. 앱 시크릿 확인: 설정 > 기본 설정 > 앱 시크릿 코드 → 배포 환경변수 `META_APP_SECRET`에 입력

## 2. 웹훅 구독 등록

1. 임의의 긴 무작위 문자열을 만들어 `IG_WEBHOOK_VERIFY_TOKEN` 환경변수에 입력하고 재배포
2. 앱 대시보드 > Webhooks > **Instagram** 구독:
   - 콜백 URL: `https://finch.ai.kr/api/webhooks/instagram`
   - 확인 토큰: 위에서 정한 값 (일치하면 우리 라우트가 hub.challenge를 에코해 검증 통과)
3. 구독 필드: **comments**(필수), **messages**(수신거부 답장 처리용 권장)
4. 연동 IG 계정이 앱에 연결된 페이스북 페이지와 묶여 있어야 이벤트가 온다

## 3. 개발자 모드 테스트 (심사 전, 본인 계정으로)

심사 승인 전에는 앱 관리자/개발자/테스터 계정(최대 25명)에만 동작한다. 이 단계에서 파이프라인 전체를 실검증한다.

1. 본인 IG 비즈니스 계정을 앱 역할(관리자/테스터)에 추가
2. 그래프 API 탐색기에서 `instagram_manage_messages`, `instagram_manage_comments`, `pages_manage_metadata` 권한이 든 토큰 발급 → `IG_TEST_ACCESS_TOKEN`에 임시 입력 (OAuth 연동 전 브릿지)
3. Supabase `connected_accounts`에 본인 계정 행 추가하고 `platform_user_id`에 IG 사용자 id 입력 (웹훅 entry.id와 매핑되는 값)
4. `users_profile.plan`을 `creator` 이상으로 변경 (free는 월 발송 한도 0 — 발송이 전부 skipped 처리됨)
5. 앱 `/auto-dm`에서 규칙 생성(실제 DB `auto_dm_rules`에 저장됨) → 본인 게시물에 키워드 댓글 → DM 도착 확인
6. 확인 포인트: dm_sends에 행 1개(중복 웹훅에도 1개), 같은 댓글 재발송 안 됨, `수신거부` 답장 후 재댓글 시 skipped_optout, 광고성 규칙은 본문 앞 (광고)·끝 수신거부 안내 포함

## 4. 앱 심사 (Advanced Access) — 리드타임 수주~수개월, 최우선 착수

1. 사업자 인증(Business Verification) 먼저 — 사업자등록증 필요
2. App Review 신청 권한: `instagram_manage_messages`, `instagram_manage_comments` (+ 기존 분석 권한과 별개)
3. 스크린캐스트 필수 — 반려 1순위 원인. 반드시 담을 것:
   - 사용자가 게시물·키워드·메시지를 직접 설정하는 화면 (자동 스팸이 아니라 사용자 의도 기반임을 증명)
   - 댓글 → DM 수신 전체 흐름
   - **수신거부 동작** (수신거부 답장 → 이후 발송 제외) — 심사가 명시적으로 요구
4. 사용 사례 설명: "게시물 댓글로 정보를 요청한 사용자에게 응답을 전달하는 도구" (대량 마케팅 발송으로 쓰지 않음을 명확히)
5. 반려 2~3회는 정상 범위 — 반려 사유 보고 스크린캐스트 보강 후 재신청

## 5. 운영 전환 시 남은 코드 작업 (Claude Code 담당)

- [x] 규칙 CRUD 실구현 — 앱에서 만든 규칙이 `auto_dm_rules`에 저장·조회된다 (데모 모드는 샘플 유지)
- [x] IG 계정 OAuth 연동 플로우 → `connected_accounts`에 토큰 저장 (+ `platform_user_id` 자동 기록)
- [x] 토큰 암호화 — 앱단 AES-256-GCM 확정(lib/crypto/tokens), decryptToken 실구현 (IG_TEST_ACCESS_TOKEN은 dev 폴백으로 유지)
- [x] held_night(야간 보류)·pending(일시 오류) 재처리 크론 (/api/cron/flush-dms) — 아침 8시 KST 플러시, 7일 창 만료분 window_expired 처리
- [ ] 규칙 상세에 dm_sends 상태별 발송 로그 표 (성공/대기/실패 사유별)
- [ ] 대량 트래픽 시 Inngest 큐 도입 (계정당 시간당 상한 스로틀 — 비용 문서 1-1)

## 참고 문서

- 비용·정책·운영 리스크 전체: [`AUTO_DM_COST_RISK.md`](AUTO_DM_COST_RISK.md)
- 연동 순서 로드맵: [`API_ROADMAP.md`](API_ROADMAP.md) 3-확장
- DB 스키마: `../supabase/migrations/0002_auto_dm.sql`, `0004_dm_send_pipeline.sql`
