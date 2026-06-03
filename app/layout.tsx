import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Startup Legal Risk Checker",
  description: "창업 아이디어의 법적 리스크를 AI가 사전 분석합니다",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
