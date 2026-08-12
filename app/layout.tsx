import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "해운대 스마트 백사장 안전 지도", description: "격자 주소 기반 해운대 안전 지원 시스템" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
