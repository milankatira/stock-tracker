import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

// Self-hosted Inter via next/font with display:swap — zero CLS, no Google CDN
// request. Exposes the --font-inter CSS variable consumed by globals.css.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "FinSight AI",
  description:
    "Plain-English investment analysis for Indian stocks and mutual funds.",
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en-IN" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        {/* Cookieless, first-party analytics — no DPDP consent burden. */}
        <Analytics />
      </body>
    </html>
  );
}
