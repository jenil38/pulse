import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, strict jobs:
 *   Inter          all interface and marketing text
 *   JetBrains Mono ONLY asset ids, metrics, timestamps, schema, shortcuts
 */
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PULSE — Data Resilience Digital Twin",
  description:
    "See failure before it spreads. Model your data system as a dependency network, simulate failures, and understand blast radius before reality does.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-mode="normal" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
