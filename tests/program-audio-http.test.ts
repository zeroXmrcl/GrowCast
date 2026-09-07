import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {writeRestreamAudio} from "../lib/restream/audio.ts";
import {ensureRestreamCaptureToken} from "../lib/restream/capture.ts";
import {saveMusicFile} from "../lib/restream/music-files.ts";
import {
    programAudioGetResponse,
    programMusicGetResponse,
} from "../lib/restream/program-http.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-pa-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("programAudioGetResponse", () => {
    it("denies without auth and lists playlist when url is empty", async () => {
        await withTempDataDir(async (dir) => {
            const token = await ensureRestreamCaptureToken();
            await writeRestreamAudio({url: "", volume: 0.5, paused: false});
            await saveMusicFile("z.mp3", Buffer.from("ID3"));
            const denied = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio"),
                {admin: false},
            );
            assert.equal(denied.status, 404);
            assert.notEqual(denied.status, 401);

            const ok = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio", {
                    headers: {"x-growcast-capture": token},
                }),
                {admin: false},
            );
            assert.equal(ok.status, 200);
            const body = (await ok.json()) as {
                kind: string;
                url: string;
                files: string[];
                volume: number;
                paused: boolean;
            };
            assert.equal(body.kind, "playlist");
            assert.deepEqual(body.files, ["z.mp3"]);
            assert.equal(body.url, "");
            assert.equal(body.volume, 0.5);
            assert.equal(body.paused, false);
            const encoded = JSON.stringify(body);
            assert.equal(encoded.includes(dir), false);
            assert.equal(encoded.includes("restream/music"), false);

            const asAdmin = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio"),
                {admin: true},
            );
            assert.equal(asAdmin.status, 200);
        });
    });

    it("returns kind url when audio.json has an https URL", async () => {
        await withTempDataDir(async () => {
            await writeRestreamAudio({
                url: "https://radio.example/stream",
                volume: 0.4,
                paused: true,
            });
            await saveMusicFile("a.mp3", Buffer.from("ID3"));
            const response = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio"),
                {admin: true},
            );
            assert.equal(response.status, 200);
            const body = (await response.json()) as {
                kind: string;
                url: string;
                files: string[];
                volume: number;
                paused: boolean;
            };
            assert.equal(body.kind, "url");
            assert.equal(body.url, "https://radio.example/stream");
            assert.deepEqual(body.files, ["a.mp3"]);
            assert.equal(body.volume, 0.4);
            assert.equal(body.paused, true);
        });
    });
});

describe("programMusicGetResponse", () => {
    it("rejects traversal and unauthenticated requests with 404", async () => {
        await withTempDataDir(async () => {
            const token = await ensureRestreamCaptureToken();
            await saveMusicFile("loop.mp3", Buffer.from("ID3"));

            const unauth = await programMusicGetResponse(
                new Request("http://local/api/overlay/music/loop.mp3"),
                "loop.mp3",
                {admin: false},
            );
            assert.equal(unauth.status, 404);
            assert.notEqual(unauth.status, 401);

            const traversal = await programMusicGetResponse(
                new Request("http://local/api/overlay/music/../loop.mp3", {
                    headers: {"x-growcast-capture": token},
                }),
                "../loop.mp3",
                {admin: false},
            );
            assert.equal(traversal.status, 404);

            const asAdmin = await programMusicGetResponse(
                new Request("http://local/api/overlay/music/../secret.mp3"),
                "../secret.mp3",
                {admin: true},
            );
            assert.equal(asAdmin.status, 404);
        });
    });

    it("serves music bytes with an audio content-type", async () => {
        await withTempDataDir(async () => {
            const bytes = Buffer.from("ID3-bytes");
            await saveMusicFile("loop.mp3", bytes);
            await saveMusicFile("bed.ogg", Buffer.from("OggS"));
            await saveMusicFile("hit.wav", Buffer.from("RIFF"));
            await saveMusicFile("sting.m4a", Buffer.from("ftyp"));

            const mp3 = await programMusicGetResponse(
                new Request("http://local/api/overlay/music/loop.mp3"),
                "loop.mp3",
                {admin: true},
            );
            assert.equal(mp3.status, 200);
            assert.equal(mp3.headers.get("content-type"), "audio/mpeg");
            assert.match(mp3.headers.get("cache-control") ?? "", /no-store/);
            assert.deepEqual(Buffer.from(await mp3.arrayBuffer()), bytes);

            const ogg = await programMusicGetResponse(
                new Request("http://local/api/overlay/music/bed.ogg"),
                "bed.ogg",
                {admin: true},
            );
            assert.equal(ogg.headers.get("content-type"), "audio/ogg");

            const wav = await programMusicGetResponse(
                new Request("http://local/api/overlay/music/hit.wav"),
                "hit.wav",
                {admin: true},
            );
            assert.equal(wav.headers.get("content-type"), "audio/wav");

            const m4a = await programMusicGetResponse(
                new Request("http://local/api/overlay/music/sting.m4a"),
                "sting.m4a",
                {admin: true},
            );
            assert.equal(m4a.headers.get("content-type"), "audio/mp4");

            const missing = await programMusicGetResponse(
                new Request("http://local/api/overlay/music/nope.mp3"),
                "nope.mp3",
                {admin: true},
            );
            assert.equal(missing.status, 404);
        });
    });

    it("authorizes music GET from the token query string", async () => {
        await withTempDataDir(async () => {
            const token = await ensureRestreamCaptureToken();
            const bytes = Buffer.from("ID3-query");
            await saveMusicFile("loop.mp3", bytes);

            const missing = await programMusicGetResponse(
                new Request("http://local/api/overlay/music/loop.mp3"),
                "loop.mp3",
                {admin: false},
            );
            assert.equal(missing.status, 404);

            const withQuery = await programMusicGetResponse(
                new Request(
                    `http://local/api/overlay/music/loop.mp3?token=${encodeURIComponent(token)}`,
                ),
                "loop.mp3",
                {admin: false},
            );
            assert.equal(withQuery.status, 200);
            assert.deepEqual(Buffer.from(await withQuery.arrayBuffer()), bytes);
        });
    });
});

describe("program audio wiring", () => {
    it("polls from a hidden audio client and keeps admin auth in the route", () => {
        const client = src(path.join("components", "program-audio.tsx"));
        const scene = src(path.join("components", "program-scene.tsx"));
        const audioRoute = src(path.join("app", "api", "overlay", "program-audio", "route.ts"));
        const musicRoute = src(
            path.join("app", "api", "overlay", "music", "[filename]", "route.ts"),
        );
        const http = src(path.join("lib", "restream", "program-http.ts"));

        assert.match(client, /"use client"/);
        assert.match(client, /\/api\/overlay\/program-audio/);
        assert.match(client, /2000/);
        assert.match(client, /credentials:\s*"include"/);
        assert.match(client, /x-growcast-capture/);
        assert.match(client, /\/api\/overlay\/music\//);
        assert.match(client, /\?token=/);
        assert.match(client, /<audio/);
        assert.match(client, /hidden/);
        assert.match(client, /onEnded/);
        assert.match(client, /onError/);
        assert.match(client, /paused/);
        assert.match(client, /volume/);
        assert.match(client, /loop=/);
        assert.match(client, /currentTime/);
        assert.match(client, /referrerPolicy="no-referrer"/);
        assert.doesNotMatch(client, /Date\.now\(\)/);
        assert.match(scene, /ProgramAudio/);

        assert.match(audioRoute, /withRequestLog/);
        assert.match(audioRoute, /isAdminAuthenticated/);
        assert.match(audioRoute, /programAudioGetResponse/);
        assert.match(musicRoute, /withRequestLog/);
        assert.match(musicRoute, /isAdminAuthenticated/);
        assert.match(musicRoute, /programMusicGetResponse/);
        assert.doesNotMatch(http, /isAdminAuthenticated/);
        assert.doesNotMatch(http, /next\/headers/);
    });
});
