# Domain decisions

Rules that are easy to break because they live in code, not schema comments.
Each entry says what the rule is and why it exists. If you change one, change
it everywhere it is enforced — quota semantics in particular have four call
sites that must agree.

## Quotas

- **NULL = unlimited, 0 = none.** Never coerce 0 to null. A missing quota row
  means unlimited for pre-existing accounts, but `grantDefaultQuota()` writes
  an explicit all-zeros row for newly minted accounts — that row is what makes
  "no allocation yet" a refusal instead of an open door.
- **Usage counts ALL instances**, running or stopped: a stopped VM still holds
  its overlay, IP lease and disk. Counting only running VMs lets a user stop
  everything, create a hundred, and start them all at once.
- **Pending requests count as reservations** (`getPendingUsage`), or a
  1-VM-quota user fires ten requests that all pass and finds out at approval.
  Approval must pass `excludeRequestId` or the request counts against itself.
- **Plan join, not snapshot.** Instance size resolves through the CURRENT
  plan, so resizing cannot escape a quota. `instances` stores `plan_id` only.
- **Two questions, two modules.** `quota.ts` = "may THIS user create?";
  `capacity.ts` = "does the HOST have room?". `quotatypes.ts` holds the
  shared shapes so the two never import each other.
- **Custom specs are `plans` rows with `custom=1`**, not per-instance columns.
  `plan_id` is the single source of size for quotas, domain XML, overlays and
  billing — a second sizing path would have to be mirrored in all four.
  Custom plans are hidden from the catalog and rejected by `/api/requests`,
  but stay in the admin table; `drop` refuses while referenced.

## ISO library

- **Ownership lives in `iso_uploads`, not the filesystem.** One row per
  filename; unowned files are the shared admin shelf (read-only to tenants).
- **Attach rights = own uploads + the shared shelf.** A tenant may attach any
  ISO they can see in `/api/isos/mine`; the shelf files attach but cannot be
  deleted by the tenant.
- **Quota is checked twice**: pre-upload on the declared Content-Length
  (cheap refusal), post-upload on the real size inside `saveIso`
  (`alreadyRegistered` so nothing double-counts). A violation rolls the file
  back. Per-user `withKeyLock` serializes check->commit for one user.

## Networks

- **One private net per user**: libvirt `machina-u<idx>` on 10.231.x.0/24 for
  VMs, docker `machina-cu<idx>` on 10.240.x.0/24 for containers. Same-user
  guests reach each other; cross-tenant traffic is dropped by
  `machina-vnets`/docker bridge isolation. `user_nets`/`user_dockernets` rows
  are claimed BEFORE the net exists so concurrent first-uses cannot pick the
  same idx — the claim retries on SQLITE_CONSTRAINT.
- **Bridge names are short on purpose**: `virbr-mu<idx>` because IFNAMSIZ caps
  interface names at 15 chars and the firewall matches that prefix.

## Billing

- **Spend cap is a hard stop, not a throttle.** `quotas.max_monthly_spend_cents`
  (NULL=uncapped, 0=none) is enforced in `checkQuota` for non-admin
  provisions and in the snapshot job via `spendCapVerdict()`. At the cap new
  work is refused; running VMs are NOT killed — the cap stops growth, the
  balance-zero reconciler still owns suspension.
- **Accrued charges are display-only.** `pendingChargesCents()` computes what
  `settleUser` WILL debit from unsettled usage rows. `/api/billing` and
  `/api/home/summary` both surface it; it is never written to the ledger
  early, or the hourly settle would double-count.
- **Custom plan floor is 1¢/h, deliberately.** `customRateCents` computes
  vCPU+RAM+disk and floors at 1 so a huge-but-cheap spec can never bill zero —
  zero rate means metering takes nothing and auto-suspend can never fire.
  If plans ever need sub-cent pricing, raise precision, not the floor.
- **Metering records truth, the reconciler acts on it.** 15-min `usage`
  samples -> hourly `settleUser` -> ledger debits honoring the plan's monthly
  cap (extra hours past cap are simply not billed, never negative).
  Suspend-at-zero belongs to the reconciler only.
- **Netmeter**: monthly rx+tx deltas per instance; over-quota sets a live
  `domiftune` throttle (128 kB/s each way) plus a `net_monthly.throttled`
  flag. Counter resets are absorbed — a reading below the anchor counts as
  the delta.

## Jobs

- **`jobs` table is the source of truth**, not libvirt/docker state. Workers
  claim with `status='queued' AND run_after<=now AND attempts<max_attempts`,
  `image.sync` sorts last. `finishJob` requeues with backoff until
  `max_attempts`, then fails.

## API conventions

- Every route goes through `lib/api.ts` helpers: `requireUser`/`requireAdmin`,
  `guardMutation` (same-host Origin) on every POST/DELETE that changes state,
  `jsonBody` for parsing. `requireScope` is for API-token auth only — session
  routes do not call it. The only unauthenticated routes are `/api/health`,
  `/api/version`, `/api/auth/*`. Exception: `POST /api/instances/[id]/ws-token`
  skips `guardMutation` deliberately — it mints a 120s single-channel token,
  changes no state, and is fetched same-origin by the terminal page.
- UI fetches never send credentials cross-origin; `guardMutation` is the
  server-side half of that rule.

## Module boundaries

- **`lib/host/` is the docker+iso+networks layer; `lib/core/driver` is the
  libvirt boundary.** The split is deliberate and stays: `lib/host/*` talks
  to docker, iso storage and per-user networks; every libvirt call goes
  through `virsh()` in `lib/core/driver`. Do NOT add a `lib/virt/` tree —
  two libvirt facades would drift. If `lib/host/` grows past ~15 files,
  split docker out as `lib/host/docker/` instead.
- **Toast rule is structural**: `useToast()` (sileo) for transient ok/err/
  info; sonner is reserved for the persistent job-progress toasts in
  `job-toasts.tsx`. No call site imports `sonner` directly — the palette
  routes through `useToast` for exactly this reason.

## Tenant subnets (user-picked)

- **Users pick their private vnet subnet**, Tailscale-style. IPv4 comes from
  RFC 6598 `100.64.0.0/10` (must be a /24; anchors `100.64.0.0/24`,
  `100.64.0.1/32`, `100.127.255.255/32` excluded); IPv6 comes from ULA
  `fd7a:115c:a1e0::/48` (must be a /64). Both are unique-indexed in
  `user_nets` — the friendly check in `usernetpick.ts` and the index are the
  two halves of collision avoidance.
- **The pick locks once any instance row exists.** Guest addresses are baked
  into the cloud-init seed ISO at provision; changing the subnet under a live
  or stopped VM strands it. Deleting every instance unlocks.
- **`v4_subnet`/`v6_subnet` NULL = legacy.** Rows that predate the picker keep
  `10.231.<idx>.0/24` via the `rowToNet` fallback; new rows always carry both
  picks. `subnet`/`gateway` columns still hold the v4 values for readers that
  predate the split.
- **IPv6 is SLAAC-only.** libvirt `<ip family='ipv6' address='…::1' prefix='64'/>`
  gives guests a /64 with router advertisements; no DHCPv6. There is no v6
  NAT — ULA is local-only by design, and `machina-vnets.nft` drops ULA packets
  that would egress a physical interface.
- **Pick persists before first provision** (`/api/net`, admin mirror at
  `/api/admin/users/[userId]/net`). The `user_nets` row is written with the
  idx claimed but the libvirt network stays lazy — `ensureUserNet` defines it
  with the picked subnets on first VM create. `reset` clears back to auto.
