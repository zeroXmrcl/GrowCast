import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    ADMIN_SESSION_STORE_GLOBAL_KEY,
    getAdminSessionStore,
    type StoredAdminSession,
} from "../lib/admin-session-store.ts";

describe("getAdminSessionStore", () => {
    it("shares the Map on globalThis so a second module copy sees login sessions", () => {
        const loginCopy = getAdminSessionStore();
        const session: StoredAdminSession = {
            sid: "sid-shared",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
        };
        loginCopy.set(session.sid, session);

        const g = globalThis as Record<string, unknown>;
        const fromGlobal = g[ADMIN_SESSION_STORE_GLOBAL_KEY];
        assert.equal(fromGlobal, loginCopy);

        // Next may load lib/admin-auth (and this helper) twice. A second copy
        // that only reads globalThis must see the session login just stored.
        function mediaRouteCopyGetStore(): Map<string, StoredAdminSession> {
            const existing = g[ADMIN_SESSION_STORE_GLOBAL_KEY];
            if (existing instanceof Map) {
                return existing as Map<string, StoredAdminSession>;
            }
            throw new Error("session store missing from globalThis");
        }

        const found = mediaRouteCopyGetStore().get("sid-shared");
        assert.equal(found?.sid, "sid-shared");
        loginCopy.delete("sid-shared");
    });
});
