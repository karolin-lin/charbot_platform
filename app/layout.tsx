import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "情緒卸載研究平台",
  description: "與AI聊天機器人對話的情緒卸載研究實驗平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
