import type { NextConfig } from "next";

const isStandaloneBuild = process.env.BUILD_STANDALONE === "1";

/**
 * frame-src allows HTTP so LAN MediaMTX HLS iframes work. Do not set
 * upgrade-insecure-requests: the documented compose path is HTTP.
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
].join("; ");

const nextConfig: NextConfig = {
    output: isStandaloneBuild ? "standalone" : undefined,
    experimental: {
        serverActions: {
            // Admin picture uploads: up to 10 files at 15 MB each (pre-encode)
            // plus multipart overhead. Default is 1 MB.
            bodySizeLimit: "40mb",
        },
        // middleware.ts is treated as a proxy in Next 16. That layer clones
        // the request body and silently truncates past this cap (default 10mb),
        // which corrupts server-action uploads into "unexpected response".
        proxyClientMaxBodySize: "40mb",
        middlewareClientMaxBodySize: "40mb",
    },
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
