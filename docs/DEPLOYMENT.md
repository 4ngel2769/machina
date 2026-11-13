# Deployment

Two supported shapes: **systemd on the host** (what blade runs, and the one to
use if you are also serving VM consoles) and **a container** (an immutable
artefact that mounts the host's libvirt and docker sockets).

## What the host must provide

| Piece | Why |
|---|---|
| `libvirtd` + `virsh` | the VM driver, `qemu:///system` |
| `qemu-img` | qcow2 overlays |
| `genisoimage` | cloud-init seed ISOs |
| `nftables` | guest isolation (`machina-gfw.service`) |
| `docker` | optional; the containers tab is hidden-safe without it |
| node 22+ | `tsx` runs `server.ts` directly, no compile step |

`sudo` is used for the pieces that genuinely need root (the systemd unit, the
nft table, pool definitions). The service itself runs as the operator user with
`SupplementaryGroups=libvirt kvm`.

## Install

```bash
git clone <repo> ~/machina && cd ~/machina
bun install
sudo deploy/install.sh          # idempotent; safe to re-run
```

`deploy/install.sh` will:

1. create `DATA_DIR` (default `/var/lib/machina`) and `STORAGE_DIR`
   (default `/mnt/machina`) with `images vms seeds vnc tmp ssh serial` inside
2. generate `machina.key` (AES master key, 0600) if absent
3. write `machina.env` (0600) with `AUTH_SECRET`, `ADMIN_USER`, a random
   `ADMIN_PASSWORD` on first run only
4. install and enable `machina-gfw.service` (guest isolation firewall)
5. install `machina.service` and start it

The admin password lands in `$DATA_DIR/machina.env`. It is only used to create
the admin row on first boot; later changes are bcrypt-hashed in the DB.

## Configuration

Every value in `lib/config.ts` has an env override. The ones that matter:

```env
MACHINA_STORAGE_DIR=/mnt/machina        # images, overlays, seeds, vnc, serial
MACHINA_DB_PATH=/var/lib/machina/machina.db
VIRSH_URI=qemu:///system
SERVER_PORT=3999
AUTH_SECRET=<openssl rand -hex 32>
AUTH_TRUST_HOST=true
ADMIN_USER=admin
ADMIN_PASSWORD=<first boot only>
MACHINA_MASTER_KEY=<optional, else $DATA_DIR/machina.key>
```

## The unit

```ini
[Service]
Type=simple
User=<operator>
WorkingDirectory=/home/<operator>/machina
EnvironmentFile=/var/lib/machina/machina.env
ExecStart=<node> /home/<operator>/machina/node_modules/tsx/dist/cli.mjs server.ts
Restart=always
SupplementaryGroups=libvirt kvm
```

`server.ts` is a custom HTTP + WebSocket host. Next.js alone cannot hold the
`ssh2` terminal or the VNC relay open, so the WebSocket upgrades are handled
before the Next handler sees the request.

## Network

`machina0` is a NAT network on `192.168.184.0/24` with the gateway at `.1` and a
dynamic range of `.50`–`.250`. Guests get their address **statically** from
cloud-init (the DHCP host entry is a fallback, not the mechanism), so a guest
that boots without DHCP still comes up reachable.

`machina-gfw` is what makes that network safe to hand to someone else:

- guests reach DHCP and DNS on the gateway and the public internet
- guests cannot reach the control plane (`:3999`), the host's docker bridges,
  the tailnet (`100.64.0.0/10`) or the LAN
- host→guest (terminal, VNC) is outbound and unaffected

Re-apply it after editing the ruleset:

```bash
sudo cp deploy/machina-gfw.nft /etc/nftables.d/ && sudo systemctl restart machina-gfw
sudo nft list table inet machina_gfw
```

If the network is renumbered, the bridge name and subnet appear in
`lib/config.ts` **and** `deploy/machina-gfw.nft`; change both.

## Guest consoles

Two channels exist, deliberately different:

- **In-app console** — VNC over our websocket relay, browser-side noVNC. Works
  for any user who can see the instance page. This is the default and does not
  change.
- **SPICE** — an additional `<graphics type='spice'>` element, loopback only.
  For native clients on the host (or via an ssh tunnel). It is off by default;
  turn it on per VM from the host console (`/host/<name>` → media card → spice),
  or set `MACHINA_SPICE=1` to have new domains get it at provision time.

To reach a guest's SPICE port from your workstation:

```bash
ssh -L 5930:127.0.0.1:<port> blade        # port is shown in the host console
remote-viewer spice://127.0.0.1:5930
```

SPICE binds `127.0.0.1` on the host and has no password of its own; the ssh
tunnel (or local shell) is the auth boundary. The guest firewall does not need
a rule for it — the connection is host→guest over the bridge.

## Public access

On blade the panel is bound to `127.0.0.1:3999` and published through a
tailnet VIP service plus a Cloudflare tunnel → NPM:

```
tailscale serve --bg --service svc:machina --https 443 http://127.0.0.1:3999
```

Nothing binds `0.0.0.0`. If you expose it publicly, put the tunnel in front and
keep an Access policy on the hostname; the app's own auth is the last line, not
the only one.

## First boot checklist

1. Log in as `admin`.
2. **Catalog → sync** an image. Provisioning refuses until `images.status` is
   `ready`; the download is `.part` → sha256 → rename, so a half-pull never
   looks ready.
3. Check the seeded plans, or build a custom box from numbers.
4. Create one VM and watch it reach `running` before handing out accounts.

## Upgrade

```bash
cd ~/machina
git pull
bun install
bun run build            # Next output; server.ts keeps running the old code until restart
sudo systemctl restart machina
sudo systemctl restart machina-gfw   # only if deploy/machina-gfw.nft changed
```

The DB migrates itself on boot (`lib/db/initDb.ts`), and the seed is
insert-only, so re-running never clobbers an admin edit.

## Backup

`deploy/install.sh` installs `machina-backup.timer` (nightly 03:15 + up to 20m
jitter). Each run lands in `$MACHINA_BACKUP_DIR/<timestamp>/` containing:

- `machina.db` — a consistent snapshot via `sqlite3 .backup` (safe on the live
  WAL database)
- `machina.key` — the AES master key, copied from next to the DB; without it
  every stored root/VNC password is unreadable
- `images/`, `seeds/`, `iso/` — rsynced from the storage dir

Guest overlays under `vms/` are deliberately excluded: a stopped overlay is
reproducible from base image + seed, and copying a running one mid-write is
corrupt anyway. The script keeps the newest 7 runs
(`MACHINA_BACKUP_KEEP`).

Manual run: `sudo systemctl start machina-backup.service`, or
`MACHINA_BACKUP_DIR=/path scripts/machina-backup.sh`.

Restore: stop the service, copy the snapshot DB back over
`/var/lib/machina/machina.db`, restore `machina.key`, rsync the storage
subdirs back, start the service.

## Troubleshooting

**`provisioning timeout: ssh never came up`** — the domain booted but sshd did
not. Read the guest console first: `<storage>/serial/<instanceId>.log`. Two
things cause this, and they look identical from the outside.

*No datasource.* If the console shows a login prompt with the **image's**
hostname (`localhost`) instead of the instance name, cloud-init never ran.
Debian's cloud-init is gated on a systemd **generator** that runs
`ds-identify`, which decides "is there a datasource" by probing block devices
*very* early — and then never pulls `cloud-init.target` in if it says no. A seed
on a **SATA cdrom** loses that race: the AHCI/`sr_mod` stack has not produced
`/dev/sda` yet, `blkid` sees nothing labelled `cidata`, and cloud-init is
disabled for the life of the guest. There is no log to read because the service
never started. The seed therefore attaches as a **virtio-blk disk on `vdb`**
(see `domainXml`), which the kernel claims itself before generators run. Confirm
inside the guest with `grep DataSource /var/log/cloud-init.log` — it should say
`DataSourceNoCloud [seed=/dev/vdb]`.

*No host keys.* The cloud images ship with no `/etc/ssh/ssh_host_*` keys, and
`ssh.service` refuses to start without them (`ExecStartPre=/usr/sbin/sshd -t` →
*no hostkeys available*); the seed runs `ssh-keygen -A` for exactly this reason.

**`there is an existing dhcp host entry`** — a retried provisioning reused the
MAC and the previous attempt left its reservation. `ensureIpLease` now treats an
identical reservation as success and replaces a differing one, but the manual
form is:

```bash
sudo virsh -c qemu:///system net-dumpxml --inactive machina0 | grep 52:54:00
sudo virsh -c qemu:///system net-update machina0 delete ip-dhcp-host \
  "<host mac='52:54:00:..' ip='192.168.184.5x'/>" --config
```

**409 on an instance action** — a job is `queued`/`running` for it, or the
action is invalid for its status. Check:

```bash
sqlite3 /var/lib/machina/machina.db \
  "select id,type,status,attempts,error from jobs where instance_id='<id>' order by created_at desc;"
```

Do not delete the row to "unstick" it: a job left running while you delete the
instance is what produces the next 409.
