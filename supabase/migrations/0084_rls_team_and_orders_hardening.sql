-- 0084_rls_team_and_orders_hardening.sql — 실제로 뚫려 있던 쓰기 구멍 두 개 (2026-09-07 감사)
--
-- 두 표 다 «내가 주인인 행인가»만 보고, **그 행에 무엇을 쓰는지**는 안 봤다. 0046 이 users_profile 에
-- 걸어 둔 «컬럼 단위 권한 회수»가 이 두 표에는 한 번도 적용된 적이 없다(마이그레이션 전체 grep 0건).
-- 로그인한 사용자는 브라우저 번들의 anon 키 + 자기 토큰으로 PostgREST 에 직접 쓸 수 있으므로,
-- 화면에 버튼이 없다는 것은 방어가 아니다.
--
-- ① team_members — 남을 내 워크스페이스의 «활성 팀원»으로 강제 편입
--    공격: insert {owner_user_id: 나, member_user_id: 피해자, status: 'active'}
--    피해: lib/team.ts 의 getWorkspaceOwnerId·getWorkspaceMembership 이 (member_user_id=피해자, status=active)
--          행을 찾아 **피해자의 앱 전체가 공격자 워크스페이스를 보게 된다.** 역할도 viewer 로 떨어져
--          피해자는 자기 계정·지표를 잃고 화면에서 되돌릴 방법이 없다. 피해자 uuid 는 공개 프로필
--          페이지 소스에 노출돼 있어 추측할 필요도 없다.
--    수리: INSERT 는 «초대장만» 만들 수 있게 하고(member_user_id 는 반드시 null), UPDATE 는
--          member_user_id 컬럼 자체를 못 쓰게 한다. 수락 처리는 service_role(app/(finch)/team/accept)이
--          하므로 RLS 를 우회해 정상 동작한다.
--
-- ② payment_orders — 결제 금액·플랜을 고객이 직접 써 넣기
--    공격: insert {plan:'agency', amount:100, status:'ready'} → 위젯으로 100원 결제 →
--          성공 페이지가 그 행을 «서버 신뢰값»으로 읽어 최상위 플랜을 부여한다.
--    수리: 주문 생성은 **서버만** 한다. authenticated 의 INSERT 권한을 통째로 회수한다
--          (createCheckout 을 admin 클라이언트로 옮겼다 — 같은 커밋). 읽기는 그대로 둔다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 실행.

-- ── ① team_members ────────────────────────────────────────────────────────
-- INSERT 는 «초대장» 형태만 허용한다. 사람을 붙이는 것(member_user_id·joined_at)은 수락 경로의 일이다.
drop policy if exists "members insert" on public.team_members;
create policy "members insert" on public.team_members for insert to authenticated
  with check (
    (select auth.uid()) = owner_user_id
    and member_user_id is null
    and joined_at is null
    and status = 'invited'
  );

-- UPDATE 는 정책만으로는 못 막는다 — with check 는 NEW 만 보므로 «역할 변경(활성 팀원)»과
-- «member_user_id 를 피해자로 바꾸기»를 구분할 수 없다. 그래서 컬럼 단위 권한으로 자른다.
-- 허용: role(역할 변경) · status(제거·재초대) · invite_token/invited_at(재초대) · joined_at
-- 금지: member_user_id · owner_user_id · email · id
revoke update on public.team_members from anon, authenticated;
grant update (role, status, invite_token, invited_at, joined_at)
  on public.team_members to authenticated;

comment on table public.team_members is
  '워크스페이스 멤버. 사용자 권한으로는 «초대장»만 만들고 고칠 수 있다 — member_user_id 는 수락 경로(service_role)만 쓴다(0084). 이 제약을 풀면 남을 자기 워크스페이스로 끌어올 수 있다.';

-- ── ② payment_orders ──────────────────────────────────────────────────────
-- 주문 행은 «금액의 신뢰 원천»이다(결제 승인이 이 행의 amount 를 쓴다). 고객이 쓸 수 있으면 안 된다.
drop policy if exists "own orders insert" on public.payment_orders;
revoke insert, update, delete on public.payment_orders from anon, authenticated;

comment on table public.payment_orders is
  '결제 주문. **읽기 전용이다(사용자 기준)** — 금액·플랜이 승인의 신뢰 원천이라 생성·수정은 service_role 만 한다(0084).';

-- 확인: 아래 두 줄이 각각 0행이면 성공(사용자 권한에 남은 쓰기가 없다)
-- select grantee, privilege_type, column_name from information_schema.column_privileges
--  where table_name='team_members' and grantee in ('anon','authenticated') and column_name='member_user_id';
-- select grantee, privilege_type from information_schema.table_privileges
--  where table_name='payment_orders' and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE');
