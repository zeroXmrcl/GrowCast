import {Geist, Geist_Mono} from "next/font/google";
import {headers} from "next/headers";
import {loadShareCardCopy, shareCardMetadataOrigin} from "@/lib/share-card";
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
    const origin = shareCardMetadataOrigin(headerList);
    let metadataBase: URL | undefined;
    try {
        metadataBase = new URL(origin);
    } catch {
        metadataBase = undefined;
    }
    const copy = await loadShareCardCopy("");

    return {
        title: copy.title,
        ...(metadataBase ? {metadataBase} : {}),
        openGraph: {
            title: copy.title,
            siteName: "GrowCast",
            type: "website",
            locale: "en_US",
        },
        twitter: {
            card: "summary_large_image",
            title: copy.title,
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
