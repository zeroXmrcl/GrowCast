# GrowCast exhaustive codebase audit

- **Run:** `growcast-exhaustive-codebase-audit`
- **Completed:** 2026-08-22
- **Health score:** 52 / 100
- **Confirmed Critical:** 0 (unique)
- **Confirmed High (unique after semantic dedup in master report):** 13
- **Skeptic-confirmed C/H candidates before semantic dedup:** 163 (many duplicates / downgrades)
- **Rejected by skeptic:** 10
- **Lower findings in report:** 120 (58 Medium, 50 Low, 12 Info)
- **Coverage:** 109 first-party source files (inventory)

Primary deliverable: `MASTER-REPORT-WORKFLOW-DE.md`

Post-audit remediations (tunnel-first) are tracked in **section 9** of the master report. Unique Highs H-01–H-11 and H-13 (CAS/idempotency) shipped; H-12 (same-grow two-tab LWW) remains open. Retest: `npm test` 107/107, `next build` exit 0.
