import type { Metadata } from "next";
import { pretendard } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  // TODO: 도메인 확정 시(PART 8 체크리스트) 실제 도메인으로 교체
  metadataBase: new URL("https://finch.kr"),
  title: {
    default: "핀치 (Finch) — SNS 통합 분석 & 메타광고 관리",
    template: "%s | 핀치 (Finch)",
  },
  description:
    "핀치는 인스타그램·틱톡·쓰레드를 한 곳에서 분석하고 메타광고 집행까지 관리하는 SNS 마케팅 도구입니다.",
  openGraph: {
    type: "website",
    siteName: "핀치 (Finch)",
    locale: "ko_KR",
    images: [{ url: "/brand/finch-og-1200.png", width: 1200, height: 630, alt: "핀치 (Finch)" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/finch-og-1200.png"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/finch-app-icon-180.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
