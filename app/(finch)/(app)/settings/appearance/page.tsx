import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SettingsShell } from "../_components/settings-shell";
import { ThemeChoice } from "./_components/theme-choice";

export const metadata: Metadata = {
  title: "화면 테마",
  robots: { index: false, follow: false },
};

/*
  화면 테마 — 2026-09-03 프로필 화면에서 떼어 냈다(허브 항목 하나 = 페이지 하나) → 같은 날 선택 타일로 재설계.
  상단 바 토글은 "지금 바꾸기"고 이 화면은 "내 기본값"이다. 둘 다 lib/theme 을 쓴다. 데모 분기 없음(실제로 동작한다).
*/
export default function AppearanceSettingsPage() {
  return (
    <SettingsShell title="화면 테마" description="핀치 화면을 밝게 또는 어둡게 볼 수 있어요.">
      <Card>
        <CardHeader title="테마" description="상단 바의 해·달 버튼과 같은 설정이에요. 어디서 바꿔도 함께 바뀌어요." />
        <CardBody className="pt-3">
          <ThemeChoice />
        </CardBody>
      </Card>
    </SettingsShell>
  );
}
