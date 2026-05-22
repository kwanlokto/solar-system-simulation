import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Solar System Simulation",
  description: "Interactive Keplerian solar system simulation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
