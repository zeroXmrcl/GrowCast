import {Geist, Geist_Mono} from "next/font/google";
import {headers} from "next/headers";
import {loadShareCardCopy, publicHostFromHeaders} from "@/lib/share-card";
import type {Metadata} from "next";
import React from "react";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
    const headerList = await headers();
    const host = publicHostFromHeaders(
        headerList.get("host"),
        headerList.get("x-forwarded-host"),
    );
    const copy = await loadShareCardCopy(host);
    const proto = (headerList.get("x-forwarded-proto") ?? "").split(",")[0].trim();
    const origin = host
        ? `${proto || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")}://${host}`
        : null;

    return {
        title: copy.title,
        description: copy.description,
        ...(origin ? {metadataBase: new URL(origin)} : {}),
        openGraph: {
            title: copy.title,
            description: copy.description,
            siteName: "GrowCast",
            type: "website",
            locale: "en_US",
        },
        twitter: {
            card: "summary_large_image",
            title: copy.title,
            description: copy.description,
        },
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
                {children}
            </body>
        </html>
    );
}
