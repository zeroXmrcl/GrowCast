# GrowCast exhaustive codebase audit

- **Run:** `exhaustive-codebase-audit` (budget 1,024)
- **Completed:** 2026-08-25
- **Snapshot of:** `GrowCast-GGS` @ `d306b2e` (findings in the master report are present-tense for that SHA, not HEAD)
- **Health score (at snapshot):** 59 / 100
- **Confirmed Critical:** 0 (unique)
- **Confirmed High at snapshot (unique after semantic dedup):** 13
- **Skeptic-confirmed C/H candidates before semantic dedup:** 91 (many duplicates / downgrades)
- **Rejected by skeptic:** 1
- **Lower findings in report:** 120 (58 Medium, 50 Low, 12 Info)
- **Coverage:** 195 first-party source files (inventory)

Primary deliverable: `MASTER-REPORT-WORKFLOW-DE.md`

Production path assumed: Docker Compose loopback `127.0.0.1:3000` + Cloudflare Tunnel + `GROWCAST_TRUST_PROXY=1`.

Related: defensive security assessment `docs/security-assessment-2026-08-25.md` (snapshot of the same SHA; 0 Critical, 1 High at that time). Prior workflow audit: `docs/audit-2026-08-22/` (health 52; H-01–H-11 and H-13 later shipped; H-12 two-tab LWW remained open).

Post-audit remediations on this branch (`fb80cf1`): H-01 body-clone/missing `Content-Length`, H-03–H-06 harvest/timelapse/energy copy, H-08 heading contrast, H-09/H-12 energy GET no longer persists, H-10 OG metadata ids, H-11 login metadata fallback, H-13 reset_failed retry. H-02 is size-capped (20 MiB stills / 512 MiB video) but still full-`readFile` (no Range). H-07 unbounded public gallery listing was reverted so visitors see every image. Residual: full-buffer media within those caps, in-memory sessions, no CI, CSP `'unsafe-inline'`.
