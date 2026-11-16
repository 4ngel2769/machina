# Machina v2 — TODO / Suggestions

Codebase review 2026-11-16. Ordered by priority; ★ = recommended first.
All items addressed on branch `v2-todo` (2026-11-16).

## Product gaps

- [x] ★ Tenant ISO attach: users can upload ISOs to their shelf but cannot
      attach one to their own VM — attach path is admin-only (host console
      media tab). Needs ownership check + instance-page UI.
      → `/api/instances/[id]/media` + `media` tab on instance detail +
        attach picker on `/isos` tiles. Attach = own uploads + shared shelf;
        live `change-media` on a running cdrom, `attach-disk --config` on a
        free sata slot when stopped; detach works in either state.
- [x] Per-user optional `maxMonthlySpendCents` cap (quota column), so admins
      can onboard strangers without unlimited-balance risk.
      → migration `20261116_0014`, enforced in `checkQuota` + snapshot job
        via `spendCapVerdict()`; admin sets it in the quota editor.
- [x] Live "accrued this hour" line on billing page from unsettled `usage`
      rows — displayed balance currently lags up to 1h behind reality.
      → `pendingChargesCents()` surfaced on `/api/billing` and
        `/api/home/summary`; shown on both `/billing` and `/home`.

## Performance

- [x] ★ `/api/home/summary` endpoint — home page currently does N+1 fetches
      (instances, then per-instance usage/sparkline) on a 10s poll.
      → one payload: instances join plans, windowed 48-sample usage query,
        balance/pending/accrued. Home page rewritten around it.
- [x] Ledger pagination (`?cursor=`) — `/api/billing` caps at 50 rows.
      → cursor `?before=<createdAt>:<id>`, 50/page, `nextCursor`.

## UX consistency

- [x] ★ `<DataGate>` component: fetch + min-visible + error + empty states in
      one place. 19 pages hand-roll this today.
      → `app/ui/datagate.tsx`; migrated specs, keys, notifications, tokens,
        isos (tenant+admin), billing ledger, containers list+detail, host
        panel, host vm, home, instances grid+detail, admin quotas.
        account/terms/privacy intentionally ungated (composite hook/static).
- [x] Sticky table headers (`thead th { position: sticky }`) in `.tablewrap`.
      → `.card`/`.tablewrap` tables get `max-height:70vh` + `overflow` so
        `thead th` sticks with an opaque `--surface` background.
- [x] Standardize empty states on `<Empty>` with icon everywhere.
      → admin request/audit/media cards gained `<Empty>` rows; all DataGate
        call sites pass icon+text.
- [x] Single `notify()` wrapper routing to sileo (transient) vs sonner
      (persistent) so the toast rule is structural, not per-call-site.
      → `useToast()` (sileo) is the only transient path; palette.tsx was the
        last direct sonner import and now routes through it. Rule recorded
        in DECISIONS.md.

## Correctness / robustness

- [x] Quota check-then-insert transactions (`BEGIN IMMEDIATE`) for ISO and
      container uploads — concurrent uploads can both pass at the last slot.
      → `withKeyLock(user)` in `lib/core/mutex.ts` serializes per-user
        check->commit for ISO uploads and container creates.
- [x] Verify `user_nets`/`user_dockernets` index allocation is transactional
      or UNIQUE-constrained (race on first use).
      → claim-retry loop on SQLITE_CONSTRAINT; same-user concurrent claim
        returns the winner's row.
- [x] Per-pool total-snapshots cap in addition to per-instance + free-space
      floor (8 × 1.5× growth can still fill the pool).
      → `snapshotPoolMax: 300` host-wide ceiling + `assertSnapshotQuota`.
- [x] Name the WS keepalive constant (`WS_PING_MS = 20_000`) with a comment
      linking the NPM ~90s reap, so a future "optimization" can't silently
      break terminals.
      → already done: `KEEPALIVE_MS` in `lib/core/ws-keepalive.ts` documents
        the NPM `proxy_read_timeout 45s` reap and why it must be server-side.
- [x] Delete or implement `isoUsageFor` (currently dead code).
      → deleted; usage math lives in the ISO quota path only.

## Organization / maintainability

- [x] ★ Split `lib/core/quota.ts` (400 lines, at lint cap) — move ISO/container
      checks into `lib/core/resourcequota.ts` per existing pattern.
      → `quota.ts` (user quotas) + `capacity.ts` (host ceiling) +
        `quotatypes.ts` (shared shapes); `resourcequota.ts` for ISO/container.
- [x] Split `app/(dash)/admin/cards.tsx` (380 lines) per tab before it breaks
      the 300-line cap.
      → `admin/cards/{account,media,requests,audit}.tsx` + `index.ts`.
- [x] `lib/host/` boundary cleanup: consider `lib/virt/` vs `lib/docker/`
      split (driver=libvirt, host/=docker+iso+networks).
      → decided AGAINST the split; rationale in DECISIONS.md (one libvirt
        facade via `lib/core/driver`; revisit only if lib/host/ >15 files).
- [x] Enforce `lib/api.ts` helpers (`requireScope`, `guardMutation`,
      `jsonBody`) on all routes — currently inconsistent.
      → audited: all state-changing routes use `guardMutation`+`jsonBody`;
        `requireScope` is token-auth-only by design; `ws-token` exempt with
        documented reason. Rule clarified in DECISIONS.md.
- [x] `docs/DECISIONS.md` — domain rules live only in commits/memory:
      quota NULL=unlimited semantics, ISO ownership in `iso_uploads`, jobs
      table as truth, custom plans as plans rows.
      → written; extended with spend cap, accrued, rate floor, module
        boundaries, toast rule.
- [x] Verify CI runs `bun run build` (not just typecheck+lint).
      → `.github/workflows/ci.yml` runs typecheck, lint, test AND build.
- [x] CSS layering: `.profilemenu` defined after `.dock-menu` caused the
      popup cascade bug. Split globals.css or add ordering convention; kill
      the shipped `!important`.
      → `.dock-menu.dock-menu` doubled-class selector wins on specificity;
        the shipped `!important` is gone (only `prefers-reduced-motion`
        keeps its legitimate one).
- [x] icons.tsx (416 lines) — group by domain before it hits the cap.
      → split into `icons-{status,nav,compute,media,actions}.tsx` +
        `icons-shared.tsx`; `icons.tsx` keeps the union, registry and
        named re-exports — zero call-site changes.

## Economy (policy, not code)

- [x] Custom plan rate floor is 1¢/h — confirm intentional for huge boxes or
      add sanity clamp.
      → intentional: zero rate would disable metering and auto-suspend.
        Documented in DECISIONS.md; raise precision if sub-cent pricing is
        ever needed, never drop the floor.
- [x] Bandwidth throttle is flat 128kB/s both ways — fine now; revisit if
      plans ever differentiate on bandwidth.
      → deferred by design: plans do not differentiate bandwidth today;
        revisit when a plan tier adds a bandwidth field.
