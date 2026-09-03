import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SettingsShell } from "../_components/settings-shell";
import { ThemeChoice } from "../profile/_components/theme-choice";

export const metadata: Metadata = {
  title: "화면 테마",
  robots: { index: false, follow: false },
};

/*
  화면 테마 — 2026-09-03 프로필 화면에서 떼어 냈다(허브 항목 하나 = 페이지 하나).
  상단 바 토글은 "지금 바꾸기"고 이 화면은 "내 기본값"이다. 둘 다 lib/theme 을 쓴다.
*/
export default function AppearanceSettingsPage() {
  return (
    <SettingsShell title="화면 테마" description="라이트와 다크 중에 고르세요.">
      <Card>
        <CardHeader title="테마" description="이 브라우저에 저장되는 기본값이에요" />
        <CardBody>
          <ThemeChoice />
        </CardBody>
      </Card>
    </SettingsShell>
  );
}
