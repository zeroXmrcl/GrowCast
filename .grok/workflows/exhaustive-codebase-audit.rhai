let meta = #{
    name: "exhaustive-codebase-audit",
    description: "Exhaustive multi-pass paranoid audit of GrowCast-GGS (Next.js 16, energy, live climate, Cloudflare Tunnel) with specialists, file shards, journeys, skeptic verification of Critical/High, and an English master report",
    when_to_use: "Full production-readiness / security / quality audit of GrowCast on GrowCast-GGS behind a Cloudflare Tunnel",
    phases: [
        #{ title: "Stack", detail: "Detect exact stack and adapt checklists" },
        #{ title: "Inventory", detail: "Map 100% of source files for coverage" },
        #{ title: "HighRisk", detail: "Auth, APIs, secrets, proxy, JSON stores, media, mesh" },
        #{ title: "Specialists", detail: "Required domain specialist agents in parallel" },
        #{ title: "Shards", detail: "Full-codebase file-group deep reads" },
        #{ title: "Journeys", detail: "Critical user-journey mental simulations" },
        #{ title: "CrossCut", detail: "Cross-file consistency and residual gaps" },
        #{ title: "Verify", detail: "Independent skeptics for every Critical/High" },
        #{ title: "Synthesize", detail: "English master report with health score" },
    ],
};

let findings_schema = #{
    "type": "object",
    "required": ["findings", "files_reviewed", "coverage_notes"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 14,
            "items": #{
                "type": "object",
                "required": ["severity", "file", "lines", "title", "description", "risk", "fix", "effort"],
                "properties": #{
                    "severity": #{ "type": "string", "description": "Critical | High | Medium | Low | Info" },
                    "file": #{ "type": "string" },
                    "lines": #{ "type": "string", "description": "Approximate line numbers, e.g. 42-58" },
                    "title": #{ "type": "string" },
                    "description": #{ "type": "string" },
                    "risk": #{ "type": "string" },
                    "fix": #{ "type": "string", "description": "Concrete fix with snippet or diff preferred" },
                    "effort": #{ "type": "string", "description": "S | M | L" },
                },
            },
        },
        "files_reviewed": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 40 },
        "coverage_notes": #{ "type": "string" },
    },
};

let stack_schema = #{
    "type": "object",
    "required": ["stack_summary", "router", "auth", "database", "payments", "validation", "ui", "checklist_adaptations"],
    "properties": #{
        "stack_summary": #{ "type": "string" },
        "next_version": #{ "type": "string" },
        "react_version": #{ "type": "string" },
        "router": #{ "type": "string" },
        "typescript": #{ "type": "string" },
        "auth": #{ "type": "string" },
        "database": #{ "type": "string" },
        "orm": #{ "type": "string" },
        "payments": #{ "type": "string" },
        "validation": #{ "type": "string" },
        "ui": #{ "type": "string" },
        "hosting": #{ "type": "string" },
        "checklist_adaptations": #{ "type": "string" },
        "high_risk_paths": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 30 },
    },
};

let inventory_schema = #{
    "type": "object",
    "required": ["total_source_files", "categories", "file_list_summary", "coverage_commitment"],
    "properties": #{
        "total_source_files": #{ "type": "number" },
        "categories": #{ "type": "string" },
        "file_list_summary": #{ "type": "string" },
        "coverage_commitment": #{ "type": "string" },
        "excluded_noise": #{ "type": "string" },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["real", "severity_final", "reason", "evidence"],
    "properties": #{
        "real": #{ "type": "boolean" },
        "severity_final": #{ "type": "string", "description": "Critical|High|Medium|Low|Info|Rejected" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

let report_schema = #{
    "type": "object",
    "required": ["health_score", "executive_summary", "report_markdown", "files_considered_confirmation"],
    "properties": #{
        "health_score": #{ "type": "number" },
        "executive_summary": #{ "type": "string" },
        "report_markdown": #{ "type": "string" },
        "files_considered_confirmation": #{ "type": "string" },
        "critical_count": #{ "type": "number" },
        "high_count": #{ "type": "number" },
        "medium_count": #{ "type": "number" },
        "low_count": #{ "type": "number" },
        "info_count": #{ "type": "number" },
    },
};

fn is_crit_or_high(sev) {
    if type_of(sev) != "string" { return false; }
    if sev == "Critical" || sev == "critical" || sev == "CRITICAL" { return true; }
    if sev == "High" || sev == "high" || sev == "HIGH" { return true; }
    false
}

fn is_critical(sev) {
    if type_of(sev) != "string" { return false; }
    sev == "Critical" || sev == "critical" || sev == "CRITICAL"
}

fn finding_key(f) {
    let file = if f.file != () { f.file } else { "" };
    let title = if f.title != () { f.title } else { "" };
    file + "|" + title
}

fn audit_base_rules() {
    let s = "WORKSPACE ROOT: /Users/marcel/WebstormProjects/growcastdev\n";
    s += "PROJECT: GrowCast — Next.js 16 App Router live grow dashboard (public site + admin). JSON files under data/, mesh plugin API (timelapse + GGS), energy scoreboard, live climate SSE, grow archives, admin media library, Docker standalone behind Cloudflare Tunnel, Pino logging.\n";
    s += "CURRENT BRANCH: GrowCast-GGS. Production path is Docker Compose loopback 127.0.0.1:3000 + Cloudflare Tunnel + GROWCAST_TRUST_PROXY=1. Hunt real bugs. Historical issues may already be fixed — ALWAYS re-read current code. Known prior themes: in-memory sessions, DEFAULT_GROW (now EMPTY_GROW + throw on parse), media path traversal, archives CAS, mesh fail-closed, CSP, Docker bind mounts, request-trust, energy tariffs, GGS serial stripping, OG share card.\n";
    s += "You are a cold subagent with NO prior conversation context. Use ONLY read-only tools: read_file, grep, list_dir.\n";
    s += "NEVER answer from memory. ALWAYS open the real files with read_file before asserting anything.\n";
    s += "When you analyze a component or route, ALSO open the utilities / server actions / hooks / types it imports and cross-reference them.\n";
    s += "Exclude noise: node_modules, .next, .git, .idea, binaries/images except noting presence. Include untracked source files if they exist (app/admin/admin-chrome.tsx, lib/admin/apply-media-post.ts, lib/site-nav.ts, extra tests).\n";
    s += "Severity: Critical (exploit/data-loss/auth-bypass), High (likely real security or correctness bug),\n";
    s += "Medium (real issue with moderate impact), Low (minor), Info (observation).\n";
    s += "Empty findings is valid ONLY after you actually read the assigned files and found nothing solid.\n";
    s += "Prefer concrete evidence: exact file paths, approximate line numbers, short code quotes.\n";
    s += "Suggested fixes must be concrete (snippet or diff preferred). Effort S/M/L.\n";
    s += "RUN FILTERS:\n";
    s += "1) Do NOT report mere existence of local .env.local as a finding; MAY report code that ships secrets or mangles hashes via dotenv $ expansion.\n";
    s += "2) NEVER print secret values (hashes, tokens, passwords). Redact; path + type only.\n";
    s += "3) Next.js 16 uses proxy.ts (not middleware.ts). Read proxy.ts and next.config.ts.\n";
    s += "4) No payments/Stripe/Firebase. Auth is custom scrypt + HMAC cookie + in-memory session Map. Data is JSON files, not a DB.\n";
    s += "5) Public surfaces must stay public; admin surfaces must require requireAdmin / isAdminAuthenticated. Mesh must fail-closed on GROWCAST_MESH_TOKEN.\n";
    s += "6) Deleted/legacy files do NOT exist: lib/list-public-images.ts, lib/getDashPics.ts, lib/getSetupImages.ts, app/admin/settings-notices.tsx. Use lib/media-library.ts, lib/open-media-file.ts, lib/public-media-http.ts, app/admin/admin-notice.tsx instead.\n";
    s += "7) New high-risk areas: lib/request-trust.ts, lib/energy/*, lib/ggs-live*.ts, lib/ggs-live-http.ts, lib/share-card.ts, app/opengraph-image.tsx, SSE /api/data/live-climate/stream, private vs public energy tariff.\n";
    s
}

fn specialist_prompt(name, focus, paths_hint, stack_json) {
    let p = audit_base_rules();
    p += "ROLE: " + name + "\n";
    p += "STACK CONTEXT (adapt your checklist to this exact stack):\n";
    p += stack_json + "\n";
    p += "FOCUS:\n" + focus + "\n";
    p += "START WITH THESE PATHS (then follow imports and related files):\n" + paths_hint + "\n";
    p += "Return structured findings. Max 14 highest-signal findings. Deduplicate within your report.\n";
    p += "files_reviewed must list every file you opened. coverage_notes: what you could not cover and why.\n";
    p
}

fn shard_prompt(label, files_csv, stack_json) {
    let p = audit_base_rules();
    p += "ROLE: File-shard deep auditor (" + label + ")\n";
    p += "STACK:\n" + stack_json + "\n";
    p += "YOU MUST open and fully review EVERY file listed below (100% of this shard):\n";
    p += files_csv + "\n";
    p += "For each file: bugs, logic errors, type risks, security, performance, a11y, edge cases, dead code, missing tests, races on JSON files, path traversal, authz gaps.\n";
    p += "Cross-read imports used by these files. Report only issues grounded in code you opened.\n";
    p
}

fn journey_prompt(name, steps, adversarial, stack_json) {
    let p = audit_base_rules();
    p += "ROLE: User-journey simulator — " + name + "\n";
    p += "STACK:\n" + stack_json + "\n";
    p += "Mentally simulate this journey end-to-end by READING the real code for each step.\n";
    p += "HAPPY PATH STEPS:\n" + steps + "\n";
    p += "ADVERSARIAL / FAILURE VARIANTS (must cover):\n" + adversarial + "\n";
    p += "Also consider: concurrent double-submit, network failure mid-flight, empty states, process restart (in-memory sessions), missing files, corrupt JSON, Docker bind-mount EACCES.\n";
    p += "Report concrete code-backed gaps (auth holes, races, missing error UI, wrong redirects, IDOR on archives/media).\n";
    p
}

fn merge_findings(results, into_arr, seen_map) {
    for r in results {
        if r != () && r.success && r.output != () && r.output.findings != () {
            for f in r.output.findings {
                let k = finding_key(f);
                if k != "|" && seen_map[k] == () {
                    seen_map[k] = true;
                    into_arr.push(f);
                }
            }
        }
    }
    #{ items: into_arr, seen: seen_map }
}

phase("Stack");
log("Phase Stack: detecting GrowCast stack from package.json, next.config, proxy, Docker, auth, JSON stores");

let stack_prompt = audit_base_rules();
stack_prompt += "ROLE: Stack Detection Agent\n";
stack_prompt += "Read package.json, package-lock.json (top-level deps only), next.config.ts, tsconfig.json, proxy.ts,\n";
stack_prompt += "Dockerfile, docker-compose.yml, docker-entrypoint.sh, instrumentation.ts, eslint.config.mjs,\n";
stack_prompt += "app/layout.tsx, lib/admin-auth.ts, lib/db.ts, lib/archives.ts, README.md, docs/logging.md.\n";
stack_prompt += "Determine EXACT: Next.js version, App Router vs Pages, React, TypeScript strictness, auth model,\n";
stack_prompt += "storage (JSON files), payments (none), validation (custom), UI (Tailwind 4), hosting (Docker standalone),\n";
stack_prompt += "proxy.ts pattern, test runner (node --test + strip-types), CI presence (likely none).\n";
stack_prompt += "checklist_adaptations for THIS stack (Next 16 proxy.ts, cookie admin auth, JSON file DB, mesh bearer, media uploads).\n";
stack_prompt += "List high_risk_paths.\n";

let stack_res = agent(stack_prompt, #{
    label: "stack-detect",
    capability_mode: "read-only",
    output_schema: stack_schema,
});

let stack_json = "{}";
if stack_res != () && stack_res.success && stack_res.output != () {
    stack_json = json_encode(stack_res.output);
    log("Stack detected: " + (if stack_res.output.stack_summary != () { stack_res.output.stack_summary } else { "(see stack object)" }));
} else {
    log("WARN: stack detection failed — using GrowCast fallback");
    stack_json = "{\"stack_summary\":\"Next.js 16.2.12 App Router + React 19 + TS strict + custom scrypt admin auth + JSON file store + GGS live + energy + Tailwind 4 + Docker standalone behind Cloudflare Tunnel + proxy.ts + Pino\",\"router\":\"App Router\",\"auth\":\"custom scrypt+HMAC cookie+memory Map\",\"database\":\"JSON files under data/\",\"payments\":\"none\",\"validation\":\"custom\",\"ui\":\"Tailwind 4\",\"hosting\":\"Docker standalone + Cloudflare Tunnel\"}";
}
write_scratch_file("stack.json", stack_json);

phase("Inventory");
log("Phase Inventory: mapping entire GrowCast source tree for 100% coverage");

let inv_prompt = audit_base_rules();
inv_prompt += "ROLE: Full Codebase Inventory Agent\n";
inv_prompt += "Use list_dir recursively and git-aware listing across app/, components/, lib/, tests/, scripts/, docs/,\n";
inv_prompt += "public/ (list only), utils/, root configs (package.json, next.config.ts, proxy.ts, Dockerfile,\n";
inv_prompt += "docker-compose.yml, docker-entrypoint.sh, instrumentation.ts, eslint.config.mjs, tsconfig.json, postcss.config.mjs).\n";
inv_prompt += "Include untracked source if present. Count source-relevant files excluding node_modules, .next, .git, binaries.\n";
inv_prompt += "Categorize: site pages, admin pages, API routes, components, lib, tests, config, Docker, docs, scripts.\n";
inv_prompt += "Expected ballpark ~170-200 first-party source files (app, lib including energy/ggs, tests, components, Docker, docs). Be exhaustive in file_list_summary.\n";
inv_prompt += "coverage_commitment must state subsequent audit must touch every source file listed.\n";

let inv_res = agent(inv_prompt, #{
    label: "inventory",
    capability_mode: "read-only",
    output_schema: inventory_schema,
});

let inv_notes = "";
if inv_res != () && inv_res.success && inv_res.output != () {
    inv_notes = json_encode(inv_res.output);
    let n = if inv_res.output.total_source_files != () { inv_res.output.total_source_files.to_string() } else { "?" };
    log("Inventory: ~" + n + " source files mapped");
} else {
    inv_notes = "{\"coverage_commitment\":\"fallback: all app/components/lib/tests/config/scripts/Docker\",\"total_source_files\":120}";
    log("WARN: inventory agent incomplete — proceeding with hardcoded shards");
}
write_scratch_file("inventory.json", inv_notes);

phase("HighRisk");
log("Phase HighRisk: auth, mesh, media, archives, JSON stores, proxy, secrets");

let hr_jobs = [];

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Admin-Auth-Session",
        "Login, HMAC session cookie, in-memory Map, TTL, logout, requireAdmin, isAdminAuthenticated, session fixation, cookie flags, restart invalidation, timing-safe compare.",
        "lib/admin-auth.ts, lib/admin-credentials.ts, lib/admin-session-policy.ts, lib/crypto-equal.ts, lib/password-policy.ts, lib/password-policy.json, app/admin/login-form.tsx, app/admin/logout/route.ts, app/admin/layout.tsx",
        stack_json
    ),
    label: "hr:admin-auth",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Admin-Setup-Env",
        "setup:admin script: hash format, dotenv $ escaping, rewrite of .env.local dropping GROWCAST_MESH_TOKEN, insecure flag, TTY vs piped stdin, secret length.",
        "scripts/admin-creator.mjs, lib/password-policy.ts, lib/admin-credentials.ts, tests/admin-setup.test.ts, README.md",
        stack_json
    ),
    label: "hr:admin-setup",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Admin-Actions-CSRF",
        "Server actions login/saveGrow/archives: CSRF (origin), authz, mass assignment, URL policy, atomic two-file save, rollback, rate limit key spoofing via XFF.",
        "app/admin/actions.ts, app/admin/archives/actions.ts, lib/admin/parse-grow-form.ts, lib/admin/save-settings.ts, lib/same-origin.ts, lib/url-policy.ts, lib/logging/http.ts",
        stack_json
    ),
    label: "hr:admin-actions",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Mesh-Auth",
        "GROWCAST_MESH_TOKEN fail-closed, bearer parse, timing-safe compare, unknown plugin, logging of failures without leaking token.",
        "lib/mesh-auth.ts, app/api/mesh/[pluginId]/route.ts, lib/timelapse-settings.ts, tests/security.test.ts",
        stack_json
    ),
    label: "hr:mesh",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Media-Upload",
        "POST /api/admin/media: auth, size cap vs next.config proxyClientMaxBodySize, path traversal, MIME sniffing, overwrite, CSRF/same-origin, apply-media-post.",
        "app/api/admin/media/route.ts, lib/media-library.ts, lib/admin/apply-media-post.ts, lib/safe-media-filename.ts, lib/same-origin.ts, app/admin/media-manager.tsx, next.config.ts",
        stack_json
    ),
    label: "hr:media",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Archives-IDOR",
        "Public archive pages vs admin complete-grow: guessable IDs, path traversal on archive files, leaked private notes, deletion races, listing unauthenticated.",
        "lib/archives.ts, app/api/archives/[archiveId]/[kind]/[filename]/route.ts, app/(site)/grows/page.tsx, app/(site)/grows/[archiveId]/page.tsx, app/admin/archives/page.tsx, app/admin/archives/actions.ts, app/admin/complete-grow-panel.tsx",
        stack_json
    ),
    label: "hr:archives",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Path-Traversal-Media-Get",
        "GET snapshots, timelapse, setup, yourPictures, archive files: .., null bytes, symlink escape, content-type, cache headers, full-file RAM buffer.",
        "app/api/snapshots/[filename]/route.ts, app/api/timelapse/route.ts, app/setup/[filename]/route.ts, app/yourPictures/[filename]/route.ts, lib/open-media-file.ts, lib/public-media-http.ts, lib/archive-media-http.ts, lib/safe-media-filename.ts, lib/extension-status.ts",
        stack_json
    ),
    label: "hr:path-trav",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-JSON-Stores",
        "data/current-grow.json and mesh plugin JSON: silent DEFAULT_GROW, corrupt JSON overwrite, non-atomic writes, GROWCAST_DATA_DIR, concurrent admin saves, archive mutation.",
        "lib/db.ts, lib/data-paths.ts, lib/timelapse-settings.ts, lib/admin/save-settings.ts, lib/archives.ts, tests/save-settings.test.ts, tests/timelapse-settings.test.ts",
        stack_json
    ),
    label: "hr:json-stores",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Public-API-Data",
        "GET /api/data/current-grow: oversharing fields, cache, CORS, PII, markdown XSS via notes consumed by public page.",
        "app/api/data/current-grow/route.ts, lib/db.ts, app/(site)/page.tsx, lib/url-policy.ts",
        stack_json
    ),
    label: "hr:public-api",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Headers-XSS-CSP",
        "CSP vs HTTP LAN streams, unsafe-inline, Cloudflare insights script, markdown react-markdown url transform, iframe streamUrl, HSTS on HTTP.",
        "next.config.ts, proxy.ts, lib/url-policy.ts, app/(site)/page.tsx, app/layout.tsx",
        stack_json
    ),
    label: "hr:csp-xss",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Secrets-Docker",
        "Env handling, Docker non-root + entrypoint chown, bind mounts, image secrets, .dockerignore, standalone server, port bind. Do not print secret values.",
        "Dockerfile, docker-compose.yml, docker-entrypoint.sh, .dockerignore, instrumentation.ts, next.config.ts, scripts/admin-creator.mjs",
        stack_json
    ),
    label: "hr:docker-secrets",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Logging-PII",
        "Pino redaction, ALS request context on security events, username in logs, stack traces in prod, spoofable client_ip, channel:security on app.start.",
        "lib/logging/, instrumentation.ts, proxy.ts, app/admin/actions.ts, lib/admin-auth.ts, lib/mesh-auth.ts, docs/logging.md",
        stack_json
    ),
    label: "hr:logging",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-RateLimit-Login",
        "Login attempt store: keying, XFF spoof, lockout DoS against admin, in-memory vs multi-instance, consume-before-verify.",
        "lib/admin-auth.ts, app/admin/actions.ts, lib/logging/http.ts, lib/request-trust.ts, lib/admin-session-store.ts",
        stack_json
    ),
    label: "hr:ratelimit",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Request-Trust-Tunnel",
        "GROWCAST_TRUST_PROXY, CF-Connecting-IP vs X-Real-IP vs XFF, shouldUseSecureCookie, publicRequestOrigin, Host vs X-Forwarded-Host, GROWCAST_PUBLIC_URL, cookie Secure vs tunnel HTTPS.",
        "lib/request-trust.ts, lib/same-origin.ts, lib/share-card.ts, docker-compose.yml, tests/request-trust.test.ts, tests/logging/http.test.ts",
        stack_json
    ),
    label: "hr:request-trust",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-GGS-Live-Ingest-SSE",
        "Mesh POST ingest auth, schema SECRET_KEYS, serial stripping on public GET, SSE slot caps, ingest rate, fail-open corrupt ggs json, DoS via many SSE clients.",
        "lib/ggs-live.ts, lib/ggs-live-http.ts, lib/ggs-live-hub.ts, lib/ggs-live-store.ts, lib/mesh-throttle.ts, app/api/data/live-climate/route.ts, app/api/data/live-climate/stream/route.ts, app/api/mesh/[pluginId]/state/route.ts",
        stack_json
    ),
    label: "hr:ggs-live",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Energy-Tariff-AuthZ",
        "Public vs private kWh tariff, cookie gate on /api/data/energy, fail-open corrupt energy settings, accrue races, archive energy copy swallow.",
        "lib/energy/http.ts, lib/energy/settings.ts, lib/energy/scoreboard.ts, lib/energy/accrue.ts, lib/energy/store.ts, lib/energy/archive.ts, app/api/data/energy/route.ts, app/(site)/energy/page.tsx",
        stack_json
    ),
    label: "hr:energy",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-Body-Limit-DoS",
        "proxy.ts Content-Length gate, missing header skip, proxyClientMaxBodySize 40mb global, unauth POST /api/admin/media 40MB, full-file media GET buffer.",
        "proxy.ts, lib/request-body-limit.ts, next.config.ts, lib/open-media-file.ts, app/api/timelapse/route.ts, tests/request-body-limit.test.ts",
        stack_json
    ),
    label: "hr:body-dos",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

hr_jobs.push(#{
    prompt: specialist_prompt(
        "HighRisk-OG-Share-Card",
        "opengraph-image and share-card origin reconstruction, Host injection, still image path traversal, PII in OG description, tunnel public URL.",
        "app/opengraph-image.tsx, lib/share-card.ts, lib/share-card-image.ts, lib/request-trust.ts, tests/share-card.test.ts",
        stack_json
    ),
    label: "hr:og-share",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

let hr_results = parallel(hr_jobs);
log("HighRisk panel complete (" + hr_jobs.len().to_string() + " agents)");

let all_findings = [];
let seen = #{};
let merged = merge_findings(hr_results, all_findings, seen);
all_findings = merged.items;
seen = merged.seen;
log("Findings after HighRisk (deduped): " + all_findings.len().to_string());
write_scratch_file("progress-highrisk.json", json_encode(#{ count: all_findings.len() }));

phase("Specialists");
log("Phase Specialists: required domain specialists");

let sp_jobs = [];

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Architecture & Next.js Core Patterns Agent",
        "App Router, RSC vs client, proxy.ts, route groups (site)/(admin), standalone output, server actions, instrumentation.",
        "app/, proxy.ts, next.config.ts, instrumentation.ts, package.json",
        stack_json
    ),
    label: "sp:architecture",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "TypeScript & Static Analysis Agent",
        "strict TS, any/unknown, unsafe casts, FormData coercion, JSON parse typing, tsconfig skipLibCheck.",
        "tsconfig.json, lib/, app/, components/, tests/",
        stack_json
    ),
    label: "sp:typescript",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Security & Red-Team Agent",
        "Adversarial: auth bypass, IDOR archives/media, path traversal, XSS markdown, CSRF, SSRF via streamUrl, secret exposure, mesh token, session after restart.",
        "lib/admin-auth.ts, app/api/, lib/archives.ts, lib/media-library.ts, lib/url-policy.ts, proxy.ts, next.config.ts",
        stack_json
    ),
    label: "sp:security",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Performance & Scalability Agent",
        "Images, sharp, gallery lists unbounded, admin media POST size, JSON full-file rewrite, in-memory maps, LCP stream iframe, SSE subscriber caps, energy poll, OG image generation.",
        "app/(site)/page.tsx, components/, lib/media-library.ts, lib/ggs-live-hub.ts, lib/energy/poll.ts, lib/share-card-image.ts, next.config.ts",
        stack_json
    ),
    label: "sp:performance",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Data Layer & Database Agent",
        "JSON file model, archives on disk, media folders, atomicity, GROWCAST_DATA_DIR, corrupt-file handling, multi-grow records.",
        "lib/db.ts, lib/archives.ts, lib/data-paths.ts, lib/timelapse-settings.ts, lib/media-library.ts",
        stack_json
    ),
    label: "sp:data-layer",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Authentication & Authorization Agent",
        "AuthZ matrix: which routes are public vs admin vs mesh. Proxy does NOT authenticate. Server actions and APIs must gate themselves.",
        "proxy.ts, lib/admin-auth.ts, lib/mesh-auth.ts, app/admin/, app/api/, app/(site)/",
        stack_json
    ),
    label: "sp:authz",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Component, Hooks, State & UI Agent",
        "React 19, client header animation, admin forms, media manager, complete-grow panel, controlled inputs, disabled login state.",
        "components/, app/admin/, app/(site)/, lib/site-nav.ts",
        stack_json
    ),
    label: "sp:ui-hooks",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Accessibility & Semantic HTML Agent",
        "Landmarks, labels, focus, keyboard, contrast, admin forms, gallery empty states, iframe title, buttons.",
        "components/, app/, app/globals.css, app/admin/login-form.tsx, app/admin/settings-form.tsx",
        stack_json
    ),
    label: "sp:a11y",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "SEO, Metadata & i18n Agent",
        "generateMetadata, missing sitemap/robots, lang=en only, OG, canonical, public grows index crawlability of archives.",
        "app/layout.tsx, app/(site)/page.tsx, app/(site)/grows/, app/not-found.tsx, README.md",
        stack_json
    ),
    label: "sp:seo-i18n",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Error Handling, Resilience & Edge-Case Agent",
        "not-found, missing error.tsx/global-error, API errors, empty gallery, missing plugin, corrupt JSON, Docker EACCES, login_disabled.",
        "app/not-found.tsx, app/api/, lib/db.ts, lib/timelapse-settings.ts, app/admin/login-form.tsx, lib/admin/notice.ts",
        stack_json
    ),
    label: "sp:resilience",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Testing, Observability & CI/CD Agent",
        "Test coverage vs risk, no GitHub Actions, node --test glob, logging tests, no e2e/browser tests, Pino observability.",
        "package.json, tests/, tests/register.mjs, tests/ts-alias-loader.mjs, docs/logging.md, instrumentation.ts",
        stack_json
    ),
    label: "sp:testing-ci",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Business Logic & Domain Agent",
        "Grow record fields, complete-grow archival, timelapse plugin settings, days since seeding timezone, multi-grow listing.",
        "lib/db.ts, lib/archives.ts, lib/timelapse-settings.ts, utils/daysSinceSeeding.ts, lib/app-timezone.ts, lib/date-only.ts, app/admin/complete-grow-panel.tsx",
        stack_json
    ),
    label: "sp:domain",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Dependency & Supply-Chain Agent",
        "next/react/sharp/pino versions, lockfile, overrides, no postinstall, Dockerfile npm ci, unused deps.",
        "package.json, package-lock.json (sample critical packages), Dockerfile, .dockerignore",
        stack_json
    ),
    label: "sp:deps",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Configuration & Environment Agent",
        "next.config headers/CSP/body size, Docker user 1001, compose bind mounts, env_file .env.local, boot logging, proxy matcher.",
        "next.config.ts, Dockerfile, docker-compose.yml, docker-entrypoint.sh, proxy.ts, instrumentation.ts, eslint.config.mjs, postcss.config.mjs",
        stack_json
    ),
    label: "sp:config",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Code Quality, Dead Code & Complexity Agent",
        "Dead exports, duplicate IP extraction, leftover middleware if any, TODO comments, god files (admin-auth, settings-form), untracked vs tracked drift.",
        "lib/, app/, components/, scripts/, proxy.ts",
        stack_json
    ),
    label: "sp:quality",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Energy Domain Specialist",
        "kWh accrual, Berlin timezone windows, catalog watts, public vs private cost, poll vs ingest, archive energy.json, fail-open settings/cursor.",
        "lib/energy/, app/(site)/energy/page.tsx, app/api/data/energy/route.ts, tests/energy-*.test.ts, components/energy-scoreboard.tsx",
        stack_json
    ),
    label: "sp:energy-domain",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Live Climate / GGS Specialist",
        "Ingest schema, public DTO, SSE hub, client hook abort, stale after 120s, device serial leakage, UI empty states.",
        "lib/ggs-live.ts, lib/ggs-live-http.ts, lib/ggs-live-hub.ts, lib/ggs-live-store.ts, lib/live-climate-view.ts, hooks/use-live-climate.ts, components/live-tent-row.tsx, components/live-climate-card.tsx, components/live-devices-card.tsx",
        stack_json
    ),
    label: "sp:ggs-live",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

sp_jobs.push(#{
    prompt: specialist_prompt(
        "Payments Specialist (negative confirmation)",
        "Confirm there is no payment/Stripe/billing surface. If any monetization or card data path exists, report it as High. Otherwise return empty findings after searching.",
        "package.json, README.md, app/, lib/",
        stack_json
    ),
    label: "sp:payments-none",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

let sp_results = parallel(sp_jobs);
log("Specialists panel complete (" + sp_jobs.len().to_string() + " agents)");
merged = merge_findings(sp_results, all_findings, seen);
all_findings = merged.items;
seen = merged.seen;
log("Findings after Specialists (deduped): " + all_findings.len().to_string());

phase("Shards");
log("Phase Shards: every GrowCast source file assigned to a deep-read shard");

let shard_specs = [
    #{ id: "site-home", files: "app/(site)/page.tsx, app/(site)/layout.tsx, app/(site)/gallery/page.tsx" },
    #{ id: "site-energy", files: "app/(site)/energy/page.tsx, components/energy-scoreboard.tsx" },
    #{ id: "site-grows", files: "app/(site)/grows/page.tsx, app/(site)/grows/format.ts, app/(site)/grows/[archiveId]/page.tsx" },
    #{ id: "admin-core", files: "app/admin/page.tsx, app/admin/layout.tsx, app/admin/login-form.tsx, app/admin/logout/route.ts, app/admin/actions.ts" },
    #{ id: "admin-settings", files: "app/admin/settings-form.tsx, app/admin/settings-fields.tsx, app/admin/complete-grow-panel.tsx" },
    #{ id: "admin-media-ui", files: "app/admin/media-manager.tsx, app/admin/admin-chrome.tsx, app/admin/admin-notice.tsx, components/admin/ui.tsx, components/admin/optional-time-input.tsx" },
    #{ id: "admin-archives", files: "app/admin/archives/page.tsx, app/admin/archives/actions.ts, app/admin/archives/[archiveId]/page.tsx" },
    #{ id: "api-admin-media", files: "app/api/admin/media/route.ts, lib/admin/apply-media-post.ts, lib/media-library.ts, lib/safe-media-filename.ts" },
    #{ id: "api-archives", files: "app/api/archives/[archiveId]/[kind]/[filename]/route.ts, lib/archives.ts, lib/archive-media-http.ts" },
    #{ id: "api-public-media", files: "app/api/data/current-grow/route.ts, app/api/snapshots/[filename]/route.ts, app/api/timelapse/route.ts, app/setup/[filename]/route.ts, app/yourPictures/[filename]/route.ts, lib/public-media-http.ts, lib/open-media-file.ts" },
    #{ id: "api-mesh", files: "app/api/mesh/[pluginId]/route.ts, app/api/mesh/[pluginId]/state/route.ts, lib/mesh-http.ts, lib/mesh-plugins.ts, lib/mesh-throttle.ts, lib/mesh-auth.ts" },
    #{ id: "api-live-climate", files: "app/api/data/live-climate/route.ts, app/api/data/live-climate/stream/route.ts, lib/ggs-live-http.ts" },
    #{ id: "api-energy", files: "app/api/data/energy/route.ts, lib/energy/http.ts, lib/energy/scoreboard.ts" },
    #{ id: "app-shell", files: "app/layout.tsx, app/not-found.tsx, app/globals.css, app/opengraph-image.tsx" },
    #{ id: "components-site", files: "components/dash-pictures.tsx, components/site-footer.tsx, components/site-header.tsx, components/snapshot-gallery.tsx, components/timelapse-player.tsx, lib/site-nav.ts, lib/site-frame.ts" },
    #{ id: "components-live", files: "components/live-climate-card.tsx, components/live-devices-card.tsx, components/live-tent-row.tsx, components/device-icons.tsx, hooks/use-live-climate.ts, lib/live-climate-view.ts" },
    #{ id: "lib-auth", files: "lib/admin-auth.ts, lib/admin-credentials.ts, lib/admin-session-policy.ts, lib/admin-session-store.ts, lib/crypto-equal.ts, lib/password-policy.ts, lib/password-policy.json" },
    #{ id: "lib-trust", files: "lib/request-trust.ts, lib/request-body-limit.ts, lib/same-origin.ts, lib/http-redirect.ts, lib/url-policy.ts" },
    #{ id: "lib-data", files: "lib/db.ts, lib/data-paths.ts, lib/coerce.ts, lib/date-only.ts, lib/app-timezone.ts, lib/timelapse-settings.ts, lib/atomic-file.ts" },
    #{ id: "lib-admin-helpers", files: "lib/admin/parse-grow-form.ts, lib/admin/save-settings.ts, lib/admin/notice.ts" },
    #{ id: "lib-media-encode", files: "lib/image-encode.ts, lib/webp-still.ts, lib/extension-status.ts" },
    #{ id: "lib-ggs", files: "lib/ggs-live.ts, lib/ggs-live-store.ts, lib/ggs-live-hub.ts, lib/air-vpd.ts" },
    #{ id: "lib-energy-core", files: "lib/energy/accrue.ts, lib/energy/store.ts, lib/energy/settings.ts, lib/energy/paths.ts, lib/energy/types.ts, lib/energy/log.ts, lib/energy/poll.ts" },
    #{ id: "lib-energy-view", files: "lib/energy/catalog.ts, lib/energy/math.ts, lib/energy/berlin.ts, lib/energy/format.ts, lib/energy/series.ts, lib/energy/archive.ts" },
    #{ id: "lib-share", files: "lib/share-card.ts, lib/share-card-image.ts" },
    #{ id: "lib-logging", files: "lib/logging/index.ts, lib/logging/logger.ts, lib/logging/http.ts, lib/logging/context.ts, lib/logging/ids.ts, lib/logging/next.ts, lib/logging/redact.ts, lib/logging/security-events.ts, lib/logging/types.ts" },
    #{ id: "proxy-config", files: "proxy.ts, next.config.ts, instrumentation.ts, package.json, tsconfig.json, eslint.config.mjs, postcss.config.mjs" },
    #{ id: "docker", files: "Dockerfile, docker-compose.yml, docker-entrypoint.sh, .dockerignore, .gitignore" },
    #{ id: "scripts-docs", files: "scripts/admin-creator.mjs, docs/logging.md, README.md, utils/daysSinceSeeding.ts" },
    #{ id: "tests-auth-sec", files: "tests/security.test.ts, tests/admin-setup.test.ts, tests/same-origin.test.ts, tests/admin-notice.test.ts, tests/admin-session-store.test.ts, tests/request-trust.test.ts, tests/request-body-limit.test.ts" },
    #{ id: "tests-data-admin", files: "tests/save-settings.test.ts, tests/parse-grow-form.test.ts, tests/timelapse-settings.test.ts, tests/archives.test.ts, tests/archive-admin.test.ts, tests/apply-media-post.test.ts, tests/media-library.test.ts, tests/grow-store.test.ts" },
    #{ id: "tests-media-http", files: "tests/open-media-file.test.ts, tests/public-media-http.test.ts, tests/archive-media-route.test.ts, tests/http-redirect.test.ts, tests/webp-still.test.ts" },
    #{ id: "tests-energy", files: "tests/energy-accrue.test.ts, tests/energy-archive.test.ts, tests/energy-catalog.test.ts, tests/energy-http.test.ts, tests/energy-math.test.ts, tests/energy-poll.test.ts, tests/energy-series.test.ts, tests/energy-settings.test.ts" },
    #{ id: "tests-ggs", files: "tests/ggs-live.test.ts, tests/ggs-live-http.test.ts, tests/ggs-live-store.test.ts, tests/live-climate-client.test.ts, tests/live-climate-view.test.ts, tests/air-vpd.test.ts, tests/mesh-http.test.ts, tests/mesh-plugins.test.ts" },
    #{ id: "tests-logging-misc", files: "tests/logging/http.test.ts, tests/logging/ids.test.ts, tests/logging/redact-logger.test.ts, tests/logging/security-context.test.ts, tests/days-since.test.ts, tests/site-header-nav.test.ts, tests/site-frame.test.ts, tests/share-card.test.ts, tests/grow-format.test.ts, tests/extension-status.test.ts, tests/register.mjs, tests/ts-alias-loader.mjs" },
];

let sh_jobs = [];
for spec in shard_specs {
    sh_jobs.push(#{
        prompt: shard_prompt(spec.id, spec.files, stack_json),
        label: "shard:" + spec.id,
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
}

let sh_results = parallel(sh_jobs);
log("Shards panel complete (" + sh_jobs.len().to_string() + " shard agents)");
merged = merge_findings(sh_results, all_findings, seen);
all_findings = merged.items;
seen = merged.seen;
log("Findings after Shards (deduped): " + all_findings.len().to_string());

phase("Journeys");
log("Phase Journeys: simulating GrowCast user journeys (happy + adversarial)");

let j_jobs = [];

j_jobs.push(#{
    prompt: journey_prompt(
        "Public dashboard view",
        "1) GET / 2) load current-grow JSON 3) render stream iframe 4) markdown notes 5) pictures 6) climate",
        "missing data file; DEFAULT_GROW silent fallback; javascript: streamUrl; empty plant; HTTP HLS vs CSP; corrupt JSON",
        stack_json
    ),
    label: "journey:public-home",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Gallery + snapshots",
        "1) /gallery 2) list snapshots 3) play timelapse 4) GET /api/snapshots and /api/timelapse",
        "path traversal; missing plugin dir; empty states; wrong content-type",
        stack_json
    ),
    label: "journey:gallery",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Admin login",
        "1) /admin 2) setup status 3) POST loginAction 4) cookie 5) settings form",
        "invalid hash after dotenv expand; short password; rate limit; CSRF; disabled form; process restart session_not_found",
        stack_json
    ),
    label: "journey:admin-login",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Save grow settings",
        "1) authenticated admin 2) edit fields 3) saveGrowAction 4) parse form 5) dual write grow+timelapse 6) revalidate",
        "partial write; URL javascript:; concurrent save; rollback failure; test isolation GROWCAST_DATA_DIR",
        stack_json
    ),
    label: "journey:save-settings",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Complete grow / archive",
        "1) complete-grow panel 2) snapshot current 3) write archive 4) public /grows and /grows/[id] 5) admin archives CRUD",
        "IDOR; leftover secrets in archive JSON; path traversal on media kind/filename; delete vs public race",
        stack_json
    ),
    label: "journey:archives",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Admin media library",
        "1) media manager 2) POST /api/admin/media 3) store under public/ 4) attach to grow 5) GET public images",
        "unauth upload; oversized body; svg/html upload XSS; traversal filename; CSRF cross-site POST",
        stack_json
    ),
    label: "journey:media",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Mesh timelapse plugin",
        "1) plugin GET /api/mesh/growcast.timelapse with Bearer 2) read/write settings file",
        "missing token fail-closed; wrong plugin id; token in logs; unset env 401 flood",
        stack_json
    ),
    label: "journey:mesh",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Logout",
        "POST /admin/logout -> clear cookie and memory session -> redirect /admin",
        "GET logout CSRF; session remains in Map; cookie not cleared; unauth logout",
        stack_json
    ),
    label: "journey:logout",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Docker compose boot",
        "setup:admin -> compose up --build -> entrypoint chown -> node server.js -> 127.0.0.1:3000 -> Cloudflare Tunnel",
        "bind mount EACCES; missing .env.local; mesh token dropped by setup rewrite; non-root; publishing 0.0.0.0; GGS env leaked into web volume",
        stack_json
    ),
    label: "journey:docker",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Concurrent admin tabs",
        "two tabs save settings / complete grow / upload media at once",
        "lost update on JSON; torn writes; duplicate archive ids",
        stack_json
    ),
    label: "journey:concurrent",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Public current-grow API consumers",
        "GET /api/data/current-grow used by header or external; cache-control",
        "overshare; stale cache; CORS if any",
        stack_json
    ),
    label: "journey:public-api",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Empty / first-run",
        "fresh clone, no data/, no pictures, no plugin, no env",
        "crash vs EMPTY_GROW; parse errors must throw not demo; login_disabled warnings; empty gallery copy",
        stack_json
    ),
    label: "journey:empty",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Live climate SSE",
        "1) GGS sidecar POST /api/mesh/growcast.ggs/state 2) public GET /api/data/live-climate 3) EventSource stream 4) homepage tent row",
        "missing token; secret keys in body; serial leak; SSE slot exhaustion; stale 120s; corrupt store fail-open; client abort",
        stack_json
    ),
    label: "journey:live-climate",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Energy scoreboard public vs admin",
        "1) ingest live 2) accrue 3) GET /api/data/energy as anonymous 4) same as admin cookie 5) /energy page",
        "private tariff leak; corrupt settings empty; archive energy missing; Berlin DST window; concurrent accrue",
        stack_json
    ),
    label: "journey:energy",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Open Graph share card",
        "1) Discord/X fetch /opengraph-image 2) publicRequestOrigin 3) still from snapshot/dashboard/setup",
        "spoofed Host/X-Forwarded-Host; missing GROWCAST_PUBLIC_URL; path escape in still; tunnel vs listen address",
        stack_json
    ),
    label: "journey:og-share",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

j_jobs.push(#{
    prompt: journey_prompt(
        "Cloudflare Tunnel production path",
        "compose loopback 127.0.0.1:3000 + cloudflared HTTPS + GROWCAST_TRUST_PROXY=1 + admin login + media POST + SSE",
        "publish 0.0.0.0; spoof CF-Connecting-IP; Secure cookie missing; CSRF Sec-Fetch-Site; HSTS on HTTP origin; GGS http://growcast:3000",
        stack_json
    ),
    label: "journey:tunnel",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

let j_results = parallel(j_jobs);
log("Journeys panel complete (" + j_jobs.len().to_string() + " agents)");
merged = merge_findings(j_results, all_findings, seen);
all_findings = merged.items;
seen = merged.seen;
log("Findings after Journeys (deduped): " + all_findings.len().to_string());

phase("CrossCut");
log("Phase CrossCut: second-pass consistency and residual sweep");

let cc_jobs = [];

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-AuthZ-Consistency",
        "Prove every mutating path calls requireAdmin or mesh auth. Proxy must not be treated as auth. List any public POST/PUT/DELETE.",
        "app/api/, app/admin/, proxy.ts, lib/admin-auth.ts, lib/mesh-auth.ts, lib/same-origin.ts",
        stack_json
    ),
    label: "cc:authz",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-Server-Only-Boundary",
        "Admin credentials, scrypt, session secret, mesh token must not leak to client bundles. Trace use client imports.",
        "lib/admin-auth.ts, lib/admin-credentials.ts, app/admin/login-form.tsx, components/, lib/logging/",
        stack_json
    ),
    label: "cc:server-only",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-IDOR-Archives-Media",
        "Hunt IDOR: archiveId enumeration, filename params, media library listing, admin vs public path mismatch.",
        "lib/archives.ts, lib/media-library.ts, app/api/archives/, app/api/admin/media/route.ts, app/(site)/grows/",
        stack_json
    ),
    label: "cc:idor",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-DoS-Limits",
        "Body size, missing Content-Length, image count, login lockout, unbounded readdir, JSON stringify of huge grow notes, archive growth, SSE caps, full-file mp4 buffer.",
        "next.config.ts, proxy.ts, lib/request-body-limit.ts, app/api/admin/media/route.ts, lib/admin-auth.ts, lib/open-media-file.ts, lib/ggs-live-hub.ts, lib/archives.ts",
        stack_json
    ),
    label: "cc:dos",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-Error-UX",
        "Map error query params to admin notices; missing error.tsx; API JSON errors vs HTML.",
        "app/admin/login-form.tsx, app/admin/admin-notice.tsx, lib/admin/notice.ts, app/not-found.tsx, app/api/",
        stack_json
    ),
    label: "cc:error-ux",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-Test-Gap-vs-Risk",
        "Compare high-risk modules to tests. Untested: proxy, media route HTTP, archives HTTP, loginAdmin, Docker entrypoint.",
        "tests/, lib/admin-auth.ts, app/api/, proxy.ts, scripts/admin-creator.mjs",
        stack_json
    ),
    label: "cc:test-gaps",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-Production-Readiness",
        "Docker standalone, chown entrypoint, env validation, logging, no healthcheck, HSTS on HTTP origin, Cloudflare Tunnel loopback bind, COOKIE_SECURE, GROWCAST_PUBLIC_URL.",
        "Dockerfile, docker-compose.yml, docker-entrypoint.sh, instrumentation.ts, next.config.ts, proxy.ts, README.md, lib/request-trust.ts",
        stack_json
    ),
    label: "cc:prod-ready",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-Multi-Grow-Integrity",
        "Current grow vs archives: complete-grow must not lose current data; listing must match disk; format helpers timezone.",
        "lib/archives.ts, lib/db.ts, app/admin/complete-grow-panel.tsx, app/(site)/grows/format.ts, lib/date-only.ts",
        stack_json
    ),
    label: "cc:multi-grow",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-Residual-File-Sweep",
        "list_dir remaining paths; open any source file not obviously covered (LICENSE, NOTICE, eslint, postcss, untracked tests). Report only real issues.",
        "LICENSE, NOTICE, eslint.config.mjs, postcss.config.mjs, public/ (structure), extensions/, qodana.yaml, todo.md",
        stack_json
    ),
    label: "cc:residual",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-Logging-vs-Auth-Events",
        "Security events must include client_ip from ALS; grow updates from server actions; session invalid after restart noise.",
        "lib/logging/logger.ts, lib/logging/security-events.ts, lib/admin-auth.ts, app/admin/actions.ts, tests/logging/security-context.test.ts",
        stack_json
    ),
    label: "cc:logging-auth",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-Energy-GGS-Integrity",
        "Private tariff never in public DTO; serials stripped; accrue lock vs ingest; energy archive vs grow archive; fail-open settings vs grow throw.",
        "lib/energy/, lib/ggs-live.ts, lib/ggs-live-store.ts, lib/archives.ts, tests/energy-http.test.ts, tests/ggs-live.test.ts",
        stack_json
    ),
    label: "cc:energy-ggs",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

cc_jobs.push(#{
    prompt: specialist_prompt(
        "CrossCut-Tunnel-Trust-Boundary",
        "Assume Cloudflare Tunnel is the only public edge. Flag any code that is unsafe if origin is loopback-only vs if operator publishes 0.0.0.0:3000.",
        "docker-compose.yml, lib/request-trust.ts, lib/admin-auth.ts, proxy.ts, next.config.ts, README.md",
        stack_json
    ),
    label: "cc:tunnel",
    capability_mode: "read-only",
    output_schema: findings_schema,
});

let cc_results = parallel(cc_jobs);
log("CrossCut panel complete (" + cc_jobs.len().to_string() + " agents)");
merged = merge_findings(cc_results, all_findings, seen);
all_findings = merged.items;
seen = merged.seen;
log("Findings after CrossCut (deduped): " + all_findings.len().to_string());
write_scratch_file("findings-all-preverify.json", json_encode(all_findings));

phase("Verify");
log("Phase Verify: independent skeptics for every Critical and High finding (fail-closed)");

let to_verify = [];
for f in all_findings {
    if is_crit_or_high(f.severity) {
        to_verify.push(f);
    }
}

let b = budget();
let room = 256;
if b != () && b.remaining != () {
    room = b.remaining;
}
let max_verify = room - 16;
if max_verify < 0 { max_verify = 0; }
if max_verify > 400 { max_verify = 400; }

let verify_slice = [];
let vi = 0;
while vi < to_verify.len() && vi < max_verify {
    verify_slice.push(to_verify[vi]);
    vi += 1;
}

if to_verify.len() > verify_slice.len() {
    log("WARN: truncated Critical/High verification from " + to_verify.len().to_string() + " to " + verify_slice.len().to_string());
} else {
    log("Verifying " + verify_slice.len().to_string() + " Critical/High findings");
}

let confirmed_high = [];
let rejected_high = [];
let unverified_high = [];

if verify_slice.len() > 0 {
    let vjobs = [];
    let vidx = 0;
    for f in verify_slice {
        let payload = json_encode(f);
        let vp = "You are an INDEPENDENT SKEPTIC / VERIFIER. REFUTE weak findings.\n";
        vp += "Default real=false unless you personally open the cited file(s) with read_file and confirm the issue.\n";
        vp += "Workspace: /Users/marcel/WebstormProjects/growcastdev\n";
        vp += "FINDING JSON:\n" + payload + "\n";
        vp += "Steps: 1) open file at lines 2) check if mitigated elsewhere 3) decide real true/false.\n";
        vp += "If real, set severity_final to Critical|High|Medium|Low|Info (may downgrade).\n";
        vp += "If false/unproven, severity_final=Rejected. evidence must quote what you saw in code.\n";
        vp += "Do not print secret values.\n";
        vjobs.push(#{
            prompt: vp,
            label: "skeptic:" + vidx.to_string(),
            capability_mode: "read-only",
            output_schema: verdict_schema,
        });
        vidx += 1;
    }

    let verdicts = parallel(vjobs);
    let i = 0;
    for v in verdicts {
        let f = verify_slice[i];
        if v != () && v.success && v.output != () && v.output.real == true
            && v.output.evidence != () && v.output.evidence != "" {
            let sf = if v.output.severity_final != () { v.output.severity_final } else { f.severity };
            if sf == "Rejected" || sf == "rejected" {
                rejected_high.push(f);
            } else {
                confirmed_high.push(#{
                    severity: sf,
                    file: f.file,
                    lines: f.lines,
                    title: f.title,
                    description: f.description,
                    risk: f.risk,
                    fix: f.fix,
                    effort: f.effort,
                    verifier_evidence: v.output.evidence,
                    verifier_reason: v.output.reason,
                });
            }
        } else {
            if v != () && v.success && v.output != () && v.output.real == false {
                rejected_high.push(f);
            } else {
                unverified_high.push(f);
            }
        }
        i += 1;
    }
}

log("Verify: confirmed=" + confirmed_high.len().to_string()
    + " rejected=" + rejected_high.len().to_string()
    + " unverified_failclosed=" + unverified_high.len().to_string());

let b2 = budget();
let crit_for_second = [];
for f in confirmed_high {
    if is_critical(f.severity) {
        crit_for_second.push(f);
    }
}

let second_confirmed_crit = [];
let room2 = 40;
if b2 != () && b2.remaining != () {
    room2 = b2.remaining;
}
let max_second = room2 - 6;
if max_second < 0 { max_second = 0; }
if max_second > 80 { max_second = 80; }

if crit_for_second.len() > 0 && max_second > 0 {
    log("Second skeptic vote on Critical findings");
    let slice2 = [];
    let ci = 0;
    while ci < crit_for_second.len() && ci < max_second {
        slice2.push(crit_for_second[ci]);
        ci += 1;
    }
    let vjobs2 = [];
    let cidx = 0;
    for f in slice2 {
        let payload = json_encode(f);
        let vp = "SECOND INDEPENDENT SKEPTIC for a Critical finding. Try hard to disprove it.\n";
        vp += "Open the code yourself. real=true only with fresh evidence. Workspace: /Users/marcel/WebstormProjects/growcastdev\n";
        vp += "FINDING:\n" + payload + "\n";
        vp += "Do not print secret values.\n";
        vjobs2.push(#{
            prompt: vp,
            label: "skeptic2:" + cidx.to_string(),
            capability_mode: "read-only",
            output_schema: verdict_schema,
        });
        cidx += 1;
    }
    let verdicts2 = parallel(vjobs2);
    let rebuilt = [];
    for f in confirmed_high {
        if !is_critical(f.severity) {
            rebuilt.push(f);
        }
    }
    let j = 0;
    for f in slice2 {
        let v = verdicts2[j];
        if v != () && v.success && v.output != () && v.output.real == true
            && v.output.evidence != () && v.output.evidence != "" {
            rebuilt.push(f);
            second_confirmed_crit.push(f);
        } else {
            rebuilt.push(#{
                severity: "High",
                file: f.file,
                lines: f.lines,
                title: f.title,
                description: f.description,
                risk: f.risk,
                fix: f.fix,
                effort: f.effort,
                verifier_evidence: if f.verifier_evidence != () { f.verifier_evidence } else { "" },
                verifier_reason: "Second skeptic did not reconfirm Critical — downgraded to High",
            });
        }
        j += 1;
    }
    let k = 0;
    for f in crit_for_second {
        if k >= slice2.len() {
            rebuilt.push(f);
        }
        k += 1;
    }
    confirmed_high = rebuilt;
    log("After second Critical vote: reconfirmed=" + second_confirmed_crit.len().to_string());
}

let lower = [];
for f in all_findings {
    if !is_crit_or_high(f.severity) {
        lower.push(f);
    }
}

let lower_capped = [];
let li = 0;
while li < lower.len() && li < 120 {
    lower_capped.push(lower[li]);
    li += 1;
}
if lower.len() > lower_capped.len() {
    log("Capped Medium/Low/Info from " + lower.len().to_string() + " to " + lower_capped.len().to_string());
}

write_scratch_file("findings-confirmed-high.json", json_encode(confirmed_high));
write_scratch_file("findings-lower.json", json_encode(lower_capped));
write_scratch_file("findings-rejected.json", json_encode(rejected_high));

phase("Synthesize");
log("Phase Synthesize: English master report");

let stats = #{
    total_raw_deduped: all_findings.len(),
    critical_high_candidates: to_verify.len(),
    confirmed_critical_high: confirmed_high.len(),
    rejected_by_skeptic: rejected_high.len(),
    unverified_failclosed: unverified_high.len(),
    lower_count: lower.len(),
    lower_in_report: lower_capped.len(),
    stack: stack_json,
    inventory: inv_notes,
};

let syn_prompt = "";
syn_prompt += "You are the Master Audit Report Writer. Write the FINAL comprehensive audit report entirely in ENGLISH.\n";
syn_prompt += "Workspace: /Users/marcel/WebstormProjects/growcastdev (GrowCast).\n";
syn_prompt += "You may re-open key files with read_file if needed to sharpen fixes, but do NOT invent new Critical/High findings.\n";
syn_prompt += "Only Critical/High findings that appear in CONFIRMED list may be reported as Critical/High.\n";
syn_prompt += "Unverified Critical/High candidates must NOT be listed as confirmed (fail-closed).\n";
syn_prompt += "Medium/Low/Info from LOWER list may be included with their severities.\n";
syn_prompt += "NEVER print secret values.\n\n";
syn_prompt += "STATS:\n" + json_encode(stats) + "\n\n";
syn_prompt += "CONFIRMED CRITICAL/HIGH (skeptic-verified):\n" + json_encode(confirmed_high) + "\n\n";
syn_prompt += "LOWER FINDINGS (Medium/Low/Info):\n" + json_encode(lower_capped) + "\n\n";
syn_prompt += "REPORT STRUCTURE (markdown in report_markdown) — exact section order:\n";
syn_prompt += "# Master Audit Report — GrowCast\n";
syn_prompt += "**Date:** 2026-08-25\n";
syn_prompt += "**Method:** Workflow, specialists, skeptics (Critical/High fail-closed)\n";
syn_prompt += "**Workspace:** /Users/marcel/WebstormProjects/growcastdev\n\n";
syn_prompt += "## 1. Method\n";
syn_prompt += "## 2. Executive Summary\n";
syn_prompt += "## 3. Health Score (0–100) + rationale\n";
syn_prompt += "## 4. Stack overview\n";
syn_prompt += "## 5. Findings (5.1 Critical, 5.2 High, 5.3 Medium, 5.4 Low, 5.5 Info)\n";
syn_prompt += "For EVERY finding: Severity, file + lines, description, risk, fix (snippet/diff), effort S/M/L, and for C/H the verifier.\n";
syn_prompt += "## 6. Prioritized remediation roadmap (immediate 0-48h / short-term 1-2 weeks / mid-term 2-6 weeks)\n";
syn_prompt += "## 7. Architecture recommendations\n";
syn_prompt += "## 8. Confirmation of 100% file coverage (Shards + Inventory)\n";
syn_prompt += "## 9. Test and CI gaps\n";
syn_prompt += "Write polished English technical prose. health_score integer 0-100.\n";
syn_prompt += "executive_summary: 1-2 paragraphs. files_considered_confirmation: a clear confirmation.\n";

let report_res = agent(syn_prompt, #{
    label: "master-report",
    capability_mode: "read-only",
    output_schema: report_schema,
});

let report_md = "";
let health = 0;
let exec_sum = "";
let files_conf = "";

if report_res != () && report_res.success && report_res.output != () {
    if report_res.output.report_markdown != () {
        report_md = report_res.output.report_markdown;
    }
    if report_res.output.health_score != () {
        health = report_res.output.health_score;
    }
    if report_res.output.executive_summary != () {
        exec_sum = report_res.output.executive_summary;
    }
    if report_res.output.files_considered_confirmation != () {
        files_conf = report_res.output.files_considered_confirmation;
    }
} else {
    log("WARN: synthesis agent failed — writing fallback English stub");
    report_md = "# Master Audit Report (Fallback)\n\nSynthesis incomplete.\n\n";
    report_md += json_encode(confirmed_high);
    report_md += "\n\n";
    report_md += json_encode(lower_capped);
    health = 50;
    exec_sum = "Fallback report: synthesis failed.";
    files_conf = "Shards covered app/, components/, lib/, tests/, Docker, configs; a second pass is recommended.";
}

let b3 = budget();
let arch_extra = "";
let room3 = 1;
if b3 != () && b3.remaining != () {
    room3 = b3.remaining;
}
if room3 > 0 {
    let arch_p = "Write a concise English section Architecture recommendations for GrowCast (Next 16, JSON files, Docker, admin cookie auth).\n";
    arch_p += "8-15 bullet recommendations. Read key files if needed. Return findings array empty; put English markdown in coverage_notes.\n";
    arch_p += "Stack: " + stack_json + "\n";
    arch_p += "Confirmed: " + json_encode(confirmed_high) + "\n";
    let arch_res = agent(arch_p, #{
        label: "arch-recommendations",
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
    if arch_res != () && arch_res.success && arch_res.output != () && arch_res.output.coverage_notes != () {
        arch_extra = arch_res.output.coverage_notes;
    }
}

if arch_extra != "" {
    report_md += "\n\n---\n\n## Additional architecture recommendations (second opinion)\n\n";
    report_md += arch_extra;
}

let final_doc = "";
final_doc += "<!-- Generated by Grok Build workflow: exhaustive-codebase-audit (GrowCast) -->\n\n";
final_doc += report_md;
final_doc += "\n\n---\n\n## Appendix — Audit metadata\n\n";
final_doc += "- Health Score: " + health.to_string() + " / 100\n";
final_doc += "- Raw findings (deduped before Verify): " + all_findings.len().to_string() + "\n";
final_doc += "- Critical/High candidates: " + to_verify.len().to_string() + "\n";
final_doc += "- Confirmed by skeptic: " + confirmed_high.len().to_string() + "\n";
final_doc += "- Rejected by skeptic: " + rejected_high.len().to_string() + "\n";
final_doc += "- Unverified (fail-closed): " + unverified_high.len().to_string() + "\n";
final_doc += "- Medium/Low/Info (total / in report): " + lower.len().to_string() + " / " + lower_capped.len().to_string() + "\n";
final_doc += "- HighRisk agents: " + hr_jobs.len().to_string() + "\n";
final_doc += "- Specialists: " + sp_jobs.len().to_string() + "\n";
final_doc += "- Shards: " + sh_jobs.len().to_string() + "\n";
final_doc += "- Journeys: " + j_jobs.len().to_string() + "\n";
final_doc += "- CrossCut: " + cc_jobs.len().to_string() + "\n";
final_doc += "- Executive Summary: " + exec_sum + "\n";
final_doc += "- File coverage: " + files_conf + "\n";

let report_path = write_scratch_file("MASTER-REPORT.md", final_doc);
write_scratch_file("executive-summary.txt", exec_sum);
write_scratch_file("audit-result.json", json_encode(#{
    health_score: health,
    confirmed_critical_high: confirmed_high,
    lower_findings: lower_capped,
    rejected: rejected_high,
    unverified: unverified_high,
    executive_summary: exec_sum,
    files_considered_confirmation: files_conf,
    report_scratch: report_path,
}));

log("Master report written to " + report_path + " | health_score=" + health.to_string());

complete(#{
    summary: "Exhaustive GrowCast audit complete. Health score " + health.to_string() + "/100. Confirmed C/H: "
        + confirmed_high.len().to_string() + ". Report: " + report_path,
    health_score: health,
    report_path: report_path,
    confirmed_critical_high_count: confirmed_high.len(),
    rejected_count: rejected_high.len(),
    lower_count: lower.len(),
    executive_summary: exec_sum,
    files_considered_confirmation: files_conf,
});
