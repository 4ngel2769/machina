# machina

Rent small VMs, kantr-style, on your own box. Next.js control plane on top of
libvirt with an SSH web terminal, a noVNC console, internal-credit billing
(hourly metering, auto-suspend at zero) and a self-healing reconciler.

## Stack

- **Next.js 16** app + custom `server.ts` (HTTP + WebSocket host, run with `tsx`)
- **better-sqlite3** (WAL), drizzle schema/migrations in `lib/db/`
- **libvirt qemu:///system** as the VM driver (`lib/core/driver.ts`)
- **next-auth v5** credentials (username/password, bcrypt), JWT sessions
- **ssh2** web terminal and **noVNC** console, both over HMAC-120s tokens

## Layout

```
lib/config.ts            env + storage dirs + limits
lib/db/                  schema, migrations, seed (plans, admin, images)
lib/core/
  driver.ts              virsh wrapper, pools/network bootstrap, domain XML
  disks.ts               qcow2 overlay creation (single source of disk names)
  cloudinit.ts           user-data/meta-data/network-config + genisoimage seed
  images.ts              catalog sync: download .part -> sha256 -> rename
  handlers.ts            job handlers: create/start/stop/delete/imageSync
  worker.ts              single-flight job claim loop
  metering.ts            15-min samples, hourly settle, monthly cap
  reconciler.ts          DB<->libvirt truth, auto-suspend, orphan cleanup
  terminal.ts            ws <-> ssh2 relay
  console-ws.ts          ws <-> vnc unix socket relay
  tokens.ts              HMAC ws tokens (120s), verified at upgrade time
app/                     UI (instances, detail w/ terminal+console, keys, billing, admin)
```

## Provisioning model

Base images are plain `.qcow2` files in the `machina-images` dir pool. A guest
disk is a `qemu-img create -b <abs base> -F qcow2` overlay in the
`machina-vms` pool, surfaced with pool-refresh (vol-create refuses existing
files). Domain XML references the disk by absolute path; VNC lands on a
per-instance unix socket under `storage/vnc/<id>.vnc`. Network `machina0` is
NAT with our own 192.168.184.x range; cloud-init hands guests a static IP plus
root password (AES-GCM encrypted at rest) and your account's SSH keys.

A create job: seed ISO -> disk overlay -> DHCP host entry -> define -> start ->
wait TCP/22 -> status running. Failure cleans disk + domain and sets
status=error; stranded provisioning rows are reaped by the worker.

## Run it

Dev:
```
bun install               # or npm i / pnpm i
MACHINA_STORAGE_DIR=/data/machina MACHINA_DB_PATH=/tmp/m.db \
  MACHINA_ADMIN_PASSWORD=test ADMIN_PASSWORD? (see lib/config) \
  AUTH_SECRET=dev AUTH_TRUST_HOST=true SERVER_PORT=3999 npx tsx server.ts
```

Login is `admin` + your `ADMIN_PASSWORD`. Create an image first (admin page,
"sync") — provisioning refuses until that image is `ready`.

Production: `deploy/install.sh` (systemd unit `machina`).

## Env

- `MACHINA_STORAGE_DIR` (default `/var/lib/machina/storage`) — images/vms/seeds/vnc/tmp/ssh
- `MACHINA_DB_PATH` (default `/var/lib/machina/machina.db`)
- `VIRSH_URI` (default `qemu:///system`)
- `SERVER_PORT` (default 3999)
- `AUTH_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD` (bootstraps the admin row)
- `MACHINA_MASTER_KEY` (optional; otherwise `<dbdir>/machina.key`, 0600)

Billing: usage sampled every 15min; hourly settle debits
`(unsettled hours, capped by plan monthly cap) * rate` from the user's balance
and writes a ledger row. Balances hit zero -> reconciler queues a stop and
marks auto-suspended.
