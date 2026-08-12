import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "해변가이드 | 해운대 안전 지도",
  description: "10m 격자 주소와 접근성 정보를 제공하는 해운대해수욕장 안전 지도",
  openGraph: { title: "해변가이드 | 해운대 안전 지도", description: "10m 격자 주소와 접근성 정보를 제공하는 해운대해수욕장 안전 지도", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "해변가이드 | 해운대 안전 지도", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
