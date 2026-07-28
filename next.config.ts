import type { NextConfig } from "next";

const isStandaloneBuild = process.env.BUILD_STANDALONE === "1";

/**
 * Security headers for all routes.
 * CSP allows self + https frame-src for MediaMTX/HLS stream embeds;
 * scripts stay self-only (no unsafe-inline) where Next permits via nonces is
 * not used here — style-src allows unsafe-inline for Tailwind runtime classes.
 */
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https: blob:",
    "media-src 'self' https: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self' https:",
    "frame-src 'self' https: http:",
    "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
    output: isStandaloneBuild ? "standalone" : undefined,
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    {
                        key: "X-Frame-Options",
                        value: "DENY",
                    },
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "Strict-Transport-Security",
                        value: "max-age=31536000; includeSubDomains",
                    },
                    {
                        key: "Content-Security-Policy",
                        value: CONTENT_SECURITY_POLICY,
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=(), payment=()",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
