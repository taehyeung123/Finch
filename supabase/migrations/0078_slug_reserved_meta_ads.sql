-- 0078_slug_reserved_meta_ads.sql — 예약어에 'meta-ads' 추가 (2026-09-01)
--
-- 메타 광고 데이터 삭제 상태 페이지(app/(finch)/(marketing)/meta-ads/data-deletion-status)를 만들었다.
-- Next.js 는 정적 경로가 동적 경로를 이기므로, 누군가 'meta-ads' 를 주소로 쓰고 있으면
-- 그 사람 페이지가 **조용히 가려진다**. 3중 방어(화면·서버·DB) 원칙대로 DB 에도 넣는다.
-- 앱 목록(lib/links/reserved.ts)은 같은 커밋에서 함께 바뀐다.

-- 자가 치유: 새 예약어를 쓰는 기존 행이 있으면 제약 추가가 통째로 실패한다.
-- 충돌 행은 임시 무작위 주소로 옮기고 slug_set_at 을 비워 «주소 정하기» 를 다시 받는다(0068·0073 과 같은 처리).
update public.link_pages
set slug = substr(md5(random()::text || id::text), 1, 8), slug_set_at = null
where slug = 'meta-ads';

alter table public.link_pages drop constraint if exists link_pages_slug_not_reserved;
alter table public.link_pages add constraint link_pages_slug_not_reserved check (
  slug not in (
    -- 마케팅 (+ PRD PART 13.2 예정 라우트 features)
    'brand','features','goodbye','instagram','meta-ads','pricing','privacy','profile-link','reference','terms','threads','tiktok',
    -- 앱(로그인 후)
    'ads','analyze','audience','auto-dm','competitors','dashboard','discover','growth','insights',
    'library','links','notifications','publish','reports','scrap','settings','studio','support',
    -- 인증·팀 라우트
    'login','signup','team',
    -- 라우트 핸들러·시스템·public/ 디렉터리
    'api','auth','p','go','oauth','onboarding','samples',
    'robots.txt','sitemap.xml','icon.svg','favicon.ico','llms.txt',
    -- 사칭 방지
    'admin','app','logout','signin','help','billing','official','about','contact','root','system',
    'static','assets','public','new','edit','delete','null','undefined','finch','me','my','sns',
    'cs','notice','qna','faq','mypage','join',
    'account','verify','password','payment','pay','security','abuse','legal',
    'unsubscribe','report','invite','download','partners',
    -- 웹 인프라 관례
    'www','mail','cdn','blog','docs','status','dev','test','staging','beta','demo','mobile'
  )
);
