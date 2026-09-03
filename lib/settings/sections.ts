import {
  Bell,
  Building2,
  CreditCard,
  KeyRound,
  Link2,
  MessageCircleQuestion,
  ScrollText,
  ShieldCheck,
  SunMoon,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/*
  계정 및 설정 — 섹션 정본 (2026-09-03 재구성).

  앞서 설정은 칩 탭 다섯 개(프로필/채널 연동/팀/요금제·결제/알림)가 한 화면 위에 나란히 있었고,
  /settings 첫 화면이 곧 «채널 연동» 이었다. 사장님 지시는 링크팜 계정 화면처럼
  **항목 하나 = 페이지 하나**, 첫 화면은 그 목록이다. 이 배열이 그 목록의 유일한 출처다 —
  허브(app/(finch)/(app)/settings/page.tsx)가 행을 그리고, 상단바(components/layout/topbar.tsx)가
  모바일 화면 이름을 여기서 꺼낸다. 두 벌로 두지 않는다(sidebar.tsx 의 NAV_GROUPS 와 같은 원칙).

  hint 는 **정적 설명**이다. 허브는 실제 상태(연결된 채널·등록 카드 등)를 읽어 이 문구를
  덮어쓴다 — 조회가 실패하면 이 정적 문구로 돌아온다. 실패를 «없음»으로 그리지 않기 위한 바닥값이다.

  순서는 «내 것 → 연결한 것 → 돈 → 규칙 → 도움» 이다. 약관·사업자 정보가 설정 안에 있는 것은
  전자상거래법·개인정보보호법상 이용자가 로그인 뒤에도 언제든 닿을 수 있어야 하기 때문이다.
*/

export interface SettingsItem {
  href: string;
  label: string;
  /** 허브 행 아래 한 줄 설명 — 없으면 라벨만 */
  hint?: string;
  icon: LucideIcon;
  /** 허브에서 이 항목만 다른 문서로 여는 경우(약관 원문 등) — 지금은 전부 앱 안 페이지 */
  external?: boolean;
}

export interface SettingsGroup {
  key: string;
  label: string;
  items: readonly SettingsItem[];
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    key: "account",
    label: "내 계정",
    items: [
      { href: "/settings/profile", label: "개인정보", hint: "이름·이메일·가입 정보", icon: User },
      { href: "/settings/logins", label: "연결된 로그인 계정", hint: "Google·카카오 로그인 연결", icon: KeyRound },
      { href: "/settings/appearance", label: "화면 테마", hint: "라이트·다크", icon: SunMoon },
    ],
  },
  {
    key: "connect",
    label: "연결",
    items: [
      { href: "/settings/channels", label: "SNS 계정 연결", hint: "인스타그램·틱톡·스레드·메타 광고", icon: Link2 },
      { href: "/settings/notifications", label: "알림 설정", hint: "알림 유형별 인앱·이메일 수신", icon: Bell },
      { href: "/settings/team", label: "팀", hint: "멤버 초대와 역할", icon: Users },
    ],
  },
  {
    key: "billing",
    label: "결제",
    items: [
      { href: "/settings/billing", label: "플랜 관리", hint: "현재 플랜·크레딧·플랜 변경", icon: CreditCard },
      { href: "/settings/billing/payment", label: "결제수단 관리", hint: "등록 카드·결제 내역", icon: Wallet },
    ],
  },
  {
    key: "legal",
    label: "약관 및 정책",
    items: [
      { href: "/settings/legal/terms", label: "이용약관", icon: ScrollText },
      { href: "/settings/legal/privacy", label: "개인정보처리방침", icon: ShieldCheck },
      { href: "/settings/legal", label: "사업자 정보", hint: "회사·사업자등록·연락처", icon: Building2 },
    ],
  },
  {
    key: "support",
    label: "지원",
    items: [{ href: "/support", label: "고객센터", hint: "문의 남기기·답변 확인", icon: MessageCircleQuestion }],
  },
];

/** 상단바 화면 이름용 — 허브 자체(/settings)는 sidebar 의 «계정 및 설정» 이 맡는다 */
export const SETTINGS_TITLES: ReadonlyArray<{ href: string; label: string }> = SETTINGS_GROUPS.flatMap((g) =>
  g.items.filter((i) => i.href.startsWith("/settings/")).map((i) => ({ href: i.href, label: i.label })),
);
