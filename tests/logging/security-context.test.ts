import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {getContext, runWithContext} from "../../lib/logging/context.ts";
import {withRequestLog} from "../../lib/logging/http.ts";
import {buildSecurityEventPayload} from "../../lib/logging/logger.ts";

describe("security event request context", () => {
    it("copies ALS client_ip onto security events", () => {
        runWithContext(
            {
                request_id: "req_abcdefghijklmnopqrstuvwx",
                trace_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                span_id: "bbbbbbbbbbbbbbbb",
                client_ip: "203.0.113.9",
                user_agent: "GrowCast-Test",
                method: "GET",
                path: "/api/snapshots/x.webp",
                route: "/api/snapshots/:filename",
            },
            () => {
                const payload = buildSecurityEventPayload("http.path_traversal_blocked", {
                    reason: "invalid_filename",
                });
                assert.equal(payload.client_ip, "203.0.113.9");
                assert.equal(payload.user_agent, "GrowCast-Test");
                assert.equal(payload.route, "/api/snapshots/:filename");
                assert.equal(payload.reason, "invalid_filename");
            },
        );
    });

    it("withRequestLog stores client_ip for path-traversal events", async () => {
        const previous = process.env.GROWCAST_TRUST_PROXY;
        process.env.GROWCAST_TRUST_PROXY = "1";
        try {
            const request = new Request("http://localhost/api/snapshots/x.webp", {
                headers: {
                    "cf-connecting-ip": "203.0.113.9",
                    "user-agent": "GrowCast-Test",
                },
            });

            await withRequestLog(request, "/api/snapshots/:filename", async () => {
                const ctx = getContext();
                assert.equal(ctx?.client_ip, "203.0.113.9");
                const payload = buildSecurityEventPayload("http.path_traversal_blocked", {
                    reason: "invalid_filename",
                });
                assert.equal(payload.client_ip, "203.0.113.9");
                return new Response("ok");
            });
        } finally {
            if (previous === undefined) {
                delete process.env.GROWCAST_TRUST_PROXY;
            } else {
                process.env.GROWCAST_TRUST_PROXY = previous;
            }
        }
    });
});
