# Machina v2 — TODO / Suggestions

Codebase review 2026-11-16. Ordered by priority; ★ = recommended first.

## Product gaps

- [ ] ★ Tenant ISO attach: users can upload ISOs to their shelf but cannot
      attach one to their own VM — attach path is admin-only (host console
      media tab). Needs ownership check + instance-page UI.
- [ ] Per-user optional `maxMonthlySpendCents` cap (quota column), so admins
      can onboard strangers without unlimited-balance risk.
- [ ] Live "accrued this hour" line on billing page from unsettled `usage`
      rows — displayed balance currently lags up to 1h behind reality.

## Performance

- [ ] ★ `/api/home/summary` endpoint — home page currently does N+1 fetches
      (instances, then per-instance usage/sparkline) on a 10s poll.
- [ ] Ledger pagination (`?cursor=`) — `/api/billing` caps at 50 rows.

## UX consistency

- [ ] ★ `<DataGate>` component: fetch + min-visible + error + empty states in
      one place. 19 pages hand-roll this today.
- [ ] Sticky table headers (`thead th { position: sticky }`) in `.tablewrap`.
- [ ] Standardize empty states on `<Empty>` with icon everywhere.
- [ ] Single `notify()` wrapper routing to sileo (transient) vs sonner
      (persistent) so the toast rule is structural, not per-call-site.

## Correctness / robustness

- [ ] Quota check-then-insert transactions (`BEGIN IMMEDIATE`) for ISO and
      container uploads — concurrent uploads can both pass at the last slot.
- [ ] Verify `user_nets`/`user_dockernets` index allocation is transactional
      or UNIQUE-constrained (race on first use).
- [ ] Per-pool total-snapshots cap in addition to per-instance + free-space
      floor (8 × 1.5× growth can still fill the pool).
- [ ] Name the WS keepalive constant (`WS_PING_MS = 20_000`) with a comment
      linking the NPM ~90s reap, so a future "optimization" can't silently
      break terminals.
- [ ] Delete or implement `isoUsageFor` (currently dead code).

## Organization / maintainability

- [ ] ★ Split `lib/core/quota.ts` (400 lines, at lint cap) — move ISO/container
      checks into `lib/core/resourcequota.ts` per existing pattern.
- [ ] Split `app/(dash)/admin/cards.tsx` (380 lines) per tab before it breaks
      the 300-line cap.
- [ ] `lib/host/` boundary cleanup: consider `lib/virt/` vs `lib/docker/`
      split (driver=libvirt, host/=docker+iso+networks).
- [ ] Enforce `lib/api.ts` helpers (`requireScope`, `guardMutation`,
      `jsonBody`) on all routes — currently inconsistent.
- [ ] `docs/DECISIONS.md` — domain rules live only in commits/memory:
      quota NULL=unlimited semantics, ISO ownership in `iso_uploads`, jobs
      table as truth, custom plans as plans rows.
- [ ] Verify CI runs `bun run build` (not just typecheck+lint).
- [ ] CSS layering: `.profilemenu` defined after `.dock-menu` caused the
      popup cascade bug. Split globals.css or add ordering convention; kill
      the shipped `!important`.
- [ ] icons.tsx (416 lines) — group by domain before it hits the cap.

## Economy (policy, not code)

- [ ] Custom plan rate floor is 1¢/h — confirm intentional for huge boxes or
      add sanity clamp.
- [ ] Bandwidth throttle is flat 128kB/s both ways — fine now; revisit if
      plans ever differentiate on bandwidth.
