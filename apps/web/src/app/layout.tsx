import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xiangqi Game",
  description: "Cờ tướng truyền thống với nhân vật chuyển động.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
