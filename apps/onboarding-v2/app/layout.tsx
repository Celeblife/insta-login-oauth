import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "../styles/onboarding.css";
import "../styles/legacy-login-intro.css";

export const metadata: Metadata = {
  title: "셀럽라이프 온보딩",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Request-time rendering lets Next attach the proxy-generated nonce to its scripts.
  await headers();
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body data-celeblife-production="true">{children}</body>
    </html>
  );
}
