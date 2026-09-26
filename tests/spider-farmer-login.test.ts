import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    mergeGgsSidecarEnv,
    spiderFarmerStatusFromEnv,
    writeSpiderFarmerBrokerEnv,
} from "../lib/ggs-sidecar-env.ts";
import {
    SpiderFarmerLoginError,
    brokerFromLogin,
    decryptSpiderFarmerBody,
    encryptSpiderFarmerBody,
    spiderFarmerFailureNotice,
    spiderFarmerMailLogin,
    spiderFarmerSystemData,
} from "../lib/spider-farmer-login.ts";

const WRITE = {
    email: "grower@example.com",
    mqttName: "grower@example.com",
    mqttPwd: "broker-secret-value",
    userId: "42",
};

describe("spider farmer login body", () => {
    it("encrypts loginMethod as a number and round-trips", () => {
        const wire = encryptSpiderFarmerBody({
            email: "a@b.c",
            loginMethod: 1,
            password: "secret",
        });
        assert.equal(wire.includes("{"), false);
        assert.deepEqual(decryptSpiderFarmerBody(wire), {
            email: "a@b.c",
            loginMethod: 1,
            password: "secret",
        });
    });

    it("builds the iOS systemdata header without a token", () => {
        const header = JSON.parse(spiderFarmerSystemData(1_700_000_000)) as Record<string, unknown>;
        assert.equal(header.appVersion, "2.5.2");
        assert.equal(header.osType, "iOS");
        assert.equal(header.timezone, "Europe/Berlin");
        assert.equal(header.timestamp, 1_700_000_000);
        assert.equal(header.reqId, 1_700_000_000_000);
        assert.equal("token" in header, false);
    });

    it("reads mqtt fields from a decrypted success body", () => {
        const broker = brokerFromLogin({
            code: "000",
            data: {mqttName: "a@b.c", mqttPwd: "broker-secret-value", userId: 42, token: "rest"},
        });
        assert.deepEqual(broker, {
            mqttName: "a@b.c",
            mqttPwd: "broker-secret-value",
            userId: "42",
        });
    });

    it("maps rejected passwords without echoing the password", async () => {
        const fetchImpl: typeof fetch = async (_url, init) => {
            const posted = decryptSpiderFarmerBody(String(init?.body));
            assert.equal(posted.loginMethod, 1);
            assert.equal(posted.password, "secret-value");
            return new Response(JSON.stringify({
                code: "100",
                msg: "The password entered is incorrect.",
                data: null,
            }), {status: 200});
        };
        await assert.rejects(
            () => spiderFarmerMailLogin("a@b.c", "secret-value", fetchImpl, 1_700_000_000),
            (error: unknown) => {
                assert.ok(error instanceof SpiderFarmerLoginError);
                assert.equal(spiderFarmerFailureNotice(error), "spider_farmer_bad_password");
                assert.equal(String(error).includes("secret-value"), false);
                return true;
            },
        );
    });
});

describe("sidecar env write", () => {
    it("replaces broker keys, drops the app password, and keeps other lines", () => {
        const next = mergeGgsSidecarEnv(
            [
                "# keep",
                "SF_SERIAL=ABC",
                "SF_MQTT_NAME=old",
                "SF_PASSWORD=app-secret",
                "GROWCAST_MESH_TOKEN=mesh",
                "",
            ].join("\n"),
            WRITE,
        );
        assert.match(next, /^# keep\n/m);
        assert.match(next, /^SF_SERIAL=ABC$/m);
        assert.match(next, /^SF_MQTT_NAME=grower@example.com$/m);
        assert.match(next, /^SF_MQTT_PWD=broker-secret-value$/m);
        assert.match(next, /^SF_USER_ID=42$/m);
        assert.match(next, /^SF_EMAIL=grower@example.com$/m);
        assert.match(next, /^GROWCAST_MESH_TOKEN=mesh$/m);
        assert.equal(next.includes("SF_PASSWORD"), false);
        assert.equal(next.includes("app-secret"), false);
        const status = spiderFarmerStatusFromEnv(next);
        assert.equal(status.configured, true);
        assert.equal(status.account, "grower@example.com");
        assert.equal(JSON.stringify(status).includes("broker-secret-value"), false);
    });

    it("writes a new env file when none exists", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "ggs-env-"));
        const file = path.join(dir, ".env");
        try {
            await writeSpiderFarmerBrokerEnv(WRITE, file);
            const text = await readFile(file, "utf8");
            assert.match(text, /^SF_MQTT_PWD=broker-secret-value$/m);
            assert.equal(text.includes("SF_PASSWORD"), false);
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    });
});
