# machina

Rent small VMs, kantr-style, on your own box. Next.js control plane on top of
libvirt with an SSH web terminal, a noVNC console, internal-credit billing
(hourly metering, auto-suspend at zero), per-account quotas and a self-healing
reconciler. Admins also get the hypervisor itself: every domain, every vnet,
every interface, plus the Docker daemon on the same page.

## Stack

- **Next.js 16** app + custom `server.ts` (HTTP + WebSocket host, run with `tsx`)
- **better-sqlite3** (WAL), drizzle schema/migrations in `lib/db/`
- **libvirt qemu:///system** as the VM driver (`lib/core/driver.ts`)
- **next-auth v5** credentials (username/password, bcrypt), JWT sessions
- **ssh2** web terminal and **noVNC** console, both over HMAC-120s tokens
- **nftables** guest isolation, applied by a oneshot unit

## Layout

```
lib/config.ts            env + storage dirs + limits
lib/db/                  schema, migrations, seed (plans, admin, images)
lib/core/
  driver.ts              virsh wrapper, pools/network bootstrap, domain XML
  disks.ts               qcow2 overlay creation (single source of disk names)
  cloudinit.ts           user-data/meta-data/network-config + genisoimage seed
  images.ts              catalog sync: download .part -> sha256 -> rename
  provision.ts           shared create path: plan, quota, IP, MAC, job
  handlers.ts            job handlers: create/start/stop/delete/snapshot/imageSync
  worker.ts              single-flight job claim loop
  quota.ts               per-account limits, reservations for pending requests
  plans.ts               preset + custom specs, rate calculation
  metering.ts            15-min samples, hourly settle, monthly cap
  netmeter.ts            per-instance byte counters -> throughput + throttle
  reconciler.ts          DB<->libvirt truth, auto-suspend, orphan cleanup
  terminal.ts            ws <-> ssh2 relay
  console-ws.ts          ws <-> vnc unix socket relay
  ws-keepalive.ts        20s ping (NPM reaps idle websockets at ~90s)
  tokens.ts              HMAC ws tokens (120s), verified at upgrade time
lib/host/
  exec.ts                host command runner (sudo -n, last stderr line)
  domains.ts             admin domain edits, disks, nics, snapshots
  networks.ts            vnet CRUD, DHCP reservations
  ifaces.ts              NetworkManager interfaces + classification
  sampler.ts             5s interface counters
  docker.ts              container inventory + lifecycle (CLI, no socket in-proc)
deploy/
  install.sh             host install (dirs, secrets, systemd units)
  machina-gfw.nft        guest isolation ruleset
  machina-gfw.service    applies it once per boot
app/(dash)/              home, instances, keys, billing, specs, host, containers, admin
```

## Provisioning model

Base images are plain `.qcow2` files in the `machina-images` dir pool. A guest
disk is a `qemu-img create -b <abs base> -F qcow2` overlay in the
`machina-vms` pool, surfaced with pool-refresh (vol-create refuses existing
files). Domain XML references the disk by absolute path; VNC lands on a
per-instance unix socket under `storage/vnc/<id>.vnc`. Network `machina0` is
NAT with our own 192.168.184.x range; cloud-init hands guests a static IP plus
root password (AES-GCM encrypted at rest) and your account's SSH keys. The seed
ISO rides on a virtio disk (`vdb`), not a cdrom: cloud-init's systemd generator
probes for the `cidata` label before the SATA stack has produced `/dev/sda`, and
a seed it cannot see means the guest boots unconfigured and provisioning times
out on SSH. `docs/DEPLOYMENT.md` has the evidence trail.

A create job: seed ISO -> disk overlay -> DHCP host entry -> define -> start ->
wait TCP/22 -> status running. Failure cleans disk + domain and sets
status=error; stranded provisioning rows are reaped by the worker.

Sizes are **plan rows**, never per-instance columns. A non-preset box is a plan
with `custom=1`: it is hidden from the catalog and the request form, and quotas,
domain XML, overlays and billing all keep reading one source of size.

## Accounts and billing

- New accounts start at **zero** — no credit, a zero quota row. A missing quota
  row still means unlimited; only freshly minted accounts are zeroed.
- Usage is sampled every 15 min; hourly settle debits
  `(unsettled hours, capped by plan monthly cap) * rate` from the balance and
  writes a ledger row. Balance at zero -> reconciler queues a stop and marks the
  instance auto-suspended.
- Quotas are enforced at request time *and* inside `provisionInstance()`.
  Pending requests count as reservations, and usage counts stopped VMs too: a
  stopped box still owns its overlay, its IP and its disk.

## Admin surfaces

- **host** (`/host`) — every libvirt domain, vnet and interface, with structural
  edits (`--config`, XML backed up first), DHCP reservations and snapshots.
- **containers** (`/containers`) — the Docker daemon: grouped by compose
  project, live CPU/RAM, health, recent logs, start/stop/restart.
- **admin** (`/admin`) — accounts, quotas, credits, role changes, plans.

## Run it

Dev:
```
bun install
MACHINA_STORAGE_DIR=/tmp/machina MACHINA_DB_PATH=/tmp/machina.db \
  AUTH_SECRET=dev AUTH_TRUST_HOST=true ADMIN_USER=admin ADMIN_PASSWORD=test \
  SERVER_PORT=3999 npx tsx server.ts
```

Login is `admin` + your `ADMIN_PASSWORD`. Create an image first (admin page,
"sync") — provisioning refuses until that image is `ready`.

Production: `deploy/install.sh` (systemd units `machina` and `machina-gfw`).
`docs/DEPLOYMENT.md` has the host requirements, the public-access path, the
upgrade procedure, backups and the failures worth knowing about.

Container: `docker-compose.example.yml` (host network, libvirt + docker sockets
mounted). It is a secondary shape; systemd on the host stays the supported one.

## Env

- `MACHINA_STORAGE_DIR` (default `/var/lib/machina/storage`) — images/vms/seeds/vnc/tmp/ssh/serial
- `MACHINA_DB_PATH` (default `/var/lib/machina/machina.db`)
- `VIRSH_URI` (default `qemu:///system`)
- `SERVER_PORT` (default 3999)
- `AUTH_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD` (bootstraps the admin row)
- `MACHINA_MASTER_KEY` (optional; otherwise `<dbdir>/machina.key`, 0600)
