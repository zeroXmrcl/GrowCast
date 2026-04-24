import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteHeader from "@/components/site-header";
import { getCurrentGrow } from "@/lib/db";
import "./globals.css";
import React from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const grow = await getCurrentGrow();

  return {
    title: "GrowCast",
    description: `Watch my ${grow.plant || "Plants"} grow`,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="flex min-h-full flex-col">
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}
