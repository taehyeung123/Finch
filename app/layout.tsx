import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { pretendard } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  // 도메인 확정: finch.ai.kr (2026-07 — finch.kr은 타사 소유라 사용 불가)
  metadataBase: new URL("https://finch.ai.kr"),
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
  // 검색엔진 소유 확인 — 서치어드바이저/서치콘솔 등록 후 발급 코드를 배포 환경변수에 넣으면 자동 반영
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION
      ? { other: { "naver-site-verification": process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION } }
      : {}),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <head>
        {/*
          FOUC 방지 — React 렌더 전에 저장된 테마를 즉시 반영한다.
          기본은 라이트(화이트가 메인). 저장값이 'dark'일 때만 data-theme=dark.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('finch-theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </html>
  );
}
