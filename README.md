# machina

Rent small VMs on your own box. A self-hosted VM-rental platform: Next.js
control plane on top of libvirt, with web terminal, VNC console, per-account
quotas, hourly metering with auto-suspend at zero balance, and a reconciler
that keeps the database and the hypervisor honest. Admins get the whole
machine: every libvirt domain, every vnet, every interface, plus the Docker
daemon.

Think of it as a tiny private cloud in a box — hand someone an account, give
them a quota, and they get a VM with a billing ledger attached.

## Features

- **VM lifecycle** — provision, start, stop, delete, clone, snapshot,
  export/import qcow2 disks
- **Web terminal** — SSH shell over websocket with HMAC-token auth, optional
  persistent session (tmux/screen attach-or-create, survives reloads)
- **VNC console** — noVNC in the browser; optional loopback SPICE for
  `remote-viewer` over an SSH tunnel
- **Accounts & quotas** — per-user VM/vCPU/RAM/disk limits, credit balances,
  admin-granted custom VM specs
- **Billing** — 15-minute sampling, hourly settle, monthly caps, auto-suspend
  at zero, full ledger
- **Images** — catalog sync (download → sha256 → rename) or admin upload of
  standalone qcow2
- **Host console** (admin) — all domains, vnets, interfaces, storage pools,
  Docker containers (with a validated create/remove), ISO attach, backups
- **Guest isolation** — nftables ruleset: DHCP/DNS + internet only, no
  host/LAN/tailnet/other-VM access
- **Self-healing** — reconciler reaps orphans, retries stuck provisioning,
  auto-suspends empty accounts; nightly backup timer included

## Requirements

- Linux with **systemd** (Debian/Ubuntu and RHEL-family supported by the
  installer)
- **KVM/libvirt**: `libvirtd`, `qemu-system-x86`, `genisoimage`
- **Node.js ≥ 20** (the installer can add the NodeSource repo)
- A user in the `libvirt` and `kvm` groups
- ~2 GB RAM free for the control plane itself; guests need what their plans
  say

## Install

One command, Coolify-style:

```bash
curl -fsSL https://raw.githubusercontent.com/4ngel2769/machina/maino/install.sh | bash
```

The installer will:

1. detect your OS and architecture
2. check for `sudo`, `git`, `curl`, Node.js ≥ 20 — offer to install missing
   pieces (NodeSource on Debian/Ubuntu, AppStream on Fedora/RHEL)
3. check for libvirt/qemu/nftables/genisoimage/sqlite3 — offer to install
   them and add you to the `libvirt`/`kvm` groups
4. clone to `/opt/machina` (override with `MACHINA_HOME`), `npm ci`, build
5. generate `/var/lib/machina/machina.env` with random `AUTH_SECRET`,
   `ADMIN_PASSWORD`, `machina.key` — printed once
6. install and start `machina.service`, `machina-gfw.service`,
   `machina-backup.timer`
7. install the **`mach`** CLI to `/usr/local/bin`

Non-interactive: `MACHINA_YES=1` auto-accepts dependency installs.
Uninstall: `mach uninstall` (keeps `/var/lib/machina` data unless `--purge`).

## `mach` CLI

```text
mach status      service, port, disk, libvirtd, docker — one screen
mach start|stop|restart
mach logs [-f]   journalctl for machina.service
mach update      git pull + npm ci + build + restart
mach backup      run the backup unit now
mach version
mach uninstall [--purge]
mach help
```

## Develop

```bash
git clone https://github.com/4ngel2769/machina.git && cd machina
npm install
MACHINA_STORAGE_DIR=/tmp/machina MACHINA_DB_PATH=/tmp/machina.db \
  AUTH_SECRET=dev AUTH_TRUST_HOST=true ADMIN_USER=admin ADMIN_PASSWORD=test \
  SERVER_PORT=3999 npx tsx server.ts
```

Login `admin` / `test`. Create a base image on the admin page ("sync" or
upload) before provisioning — guests refuse to start until one is `ready`.

## Layout

```
lib/config.ts            env + storage dirs + limits
lib/db/                  schema, migrations, seed (plans, admin, images)
lib/core/                driver (virsh), disks, cloud-init, images,
                         provision, handlers, worker, quota, plans,
                         metering, netmeter, reconciler, terminal,
                         console-ws, tokens
lib/host/                domains, networks, ifaces, pools, docker, iso
app/(dash)/              home, instances, keys, billing, specs,
                         host, containers, admin
scripts/                 machina-backup.sh, sync-fork.sh
install.sh               OS-detecting smart installer
mach                     CLI (installed to /usr/local/bin by install.sh)
deploy/                  systemd units, nftables guest-isolation ruleset
docs/DEPLOYMENT.md       host requirements, upgrades, backups,
                         public access, troubleshooting
```

## Configuration

Everything is env in `/var/lib/machina/machina.env` (0600):

| var | default | meaning |
|---|---|---|
| `MACHINA_STORAGE_DIR` | `/var/lib/machina/storage` | images/vms/seeds/vnc/tmp/ssh/serial/iso |
| `MACHINA_DB_PATH` | `/var/lib/machina/machina.db` | SQLite (WAL) |
| `VIRSH_URI` | `qemu:///system` | libvirt URI |
| `SERVER_PORT` | `3999` | HTTP+WS port |
| `AUTH_SECRET` | — | ≥24 chars, JWT + ws-token HMAC |
| `ADMIN_USER` / `ADMIN_PASSWORD` | — | bootstrap admin row |
| `MACHINA_MASTER_KEY` | `<dbdir>/machina.key` | AES key for stored passwords |
| `MACHINA_SPICE` | off | `1` adds loopback SPICE to new domains |
| `MACHINA_BACKUP_DIR` / `_KEEP` | backup script only | snapshot destination / retention |

## Security notes

- Guests are untrusted: `machina-gfw` (nftables) allows DHCP/DNS to the
  gateway and public internet only — no control plane, docker bridges,
  tailnet, or LAN.
- Web terminal and console authenticate via 120-second HMAC tokens bound to
  the instance *and* the requesting user; verified at WS upgrade.
- Guest root passwords and VNC passwords are AES-256-GCM at rest
  (`machina.key`, 0600). Losing the key makes them unreadable — it is
  included in every backup for that reason.
- API mutations require a same-origin `Origin` header; login is rate-limited.
- The panel should sit behind TLS for real use (tailnet serve, reverse proxy,
  or tunnel) — `AUTH_TRUST_HOST=true` is set by the installer for
  proxy-terminated deployments.

## Backup & restore

`machina-backup.timer` runs nightly (03:15 + ≤20m jitter) into
`$MACHINA_BACKUP_DIR/<timestamp>/`: consistent SQLite snapshot, `machina.key`,
images/seeds/iso. Guest overlays are excluded — reproducible from base image
+ seed. Restore procedure is in `docs/DEPLOYMENT.md`.

## License

MIT — see [LICENSE](LICENSE).
