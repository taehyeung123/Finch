import { FinchMark } from "@/components/logo";
import { AppIconTile } from "@/components/icons/brand";

/**
 * 로그인·회원가입 좌측 마케팅 패널 — 데스크톱 전용(모바일은 폼만).
 * 레이아웃 실측 기준(1880px 뷰포트): 페이지 인셋 40px, 패널 폭 ~68%,
 * 내부 패딩 64px, 헤드라인 32px, 서브카피 22~24px, 칩 38px.
 * radius 20px은 히어로 패널 한정 의도적 예외(카드 8px 토큰은 이 스케일에서 부자연).
 * 중앙 빈 영역은 데모 영상 슬롯 — 영상 완성 시 aspect-video <video>로 채운다.
 * 하단 스트립은 실제 지원 플랫폼 아이콘만 표기(허위 고객사 로고 금지).
 */
const FEATURES = ["레퍼런스 자동 수집", "AI 카드뉴스 제작", "메타광고 관리"];

const CHANNELS = ["instagram", "tiktok", "threads", "meta"] as const;

export function AuthMarketingPanel() {
  return (
    <div className="hidden p-10 pr-0 lg:block lg:w-[62%] xl:w-[68%]">
      <div className="flex h-full flex-col rounded-[20px] bg-gradient-to-br from-primary to-primary-pressed p-12 text-on-primary xl:p-16">
        <div className="inline-flex items-center gap-2">
          <FinchMark className="size-7" />
          <span className="text-lg font-bold tracking-tight">핀치</span>
        </div>

        <div className="mt-12">
          <h1 className="text-[28px] font-semibold leading-[1.4] tracking-tight xl:text-[34px] xl:leading-[1.35]">
            채널 분석부터 광고 관리까지, 브랜드의 성장.
            <br />
            핀치에서는 대시보드 하나로 끝나요.
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-on-primary/80 xl:text-[20px]">
            인스타그램·틱톡·쓰레드를 AI 기반으로 분석하고, 잘되는 레퍼런스 수집부터 콘텐츠 제작까지 자동으로
            이어집니다.
          </p>
          <ul className="mt-12 flex flex-wrap gap-2.5">
            {FEATURES.map((f) => (
              <li key={f} className="rounded-chip bg-body px-4 py-2 text-[15px] font-semibold text-primary-ink">
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* 데모 영상 자리 — 영상 제작 완료 시 여기에 aspect-video <video> 삽입. 그전까지 비움 */}
        <div className="mt-10 flex-1" aria-hidden />

        {/* 지원 플랫폼 스트립 — 실제 연동 대상 플랫폼만 표기 */}
        <div className="mt-10">
          <div className="flex items-center justify-center gap-7">
            {CHANNELS.map((c) => (
              <AppIconTile key={c} app={c} size={40} />
            ))}
          </div>
          <p className="mt-4 text-center text-[14px] text-on-primary/70">
            인스타그램 · 틱톡 · 쓰레드 · 메타 광고를 하나의 대시보드에서 관리합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
