# Machina Deployment & Operations Guide

This document expands on the top-level README by walking through a full installation, configuration, and validation workflow for Machina. Share it with customer teams, solution architects, and DevSecOps engineers who need to stand up a cluster-quality instance rather than just clone the repo.

---

## 1. Audience & Goals

- **Audience:** Platform operators, managed service providers, and enterprise IT teams that manage both libvirt VMs and Docker containers.
- **Focus:** Secure-by-default setup, console proxy readiness, quota/tokens configuration, and operational hand-off.

---

## 2. Platform Requirements

| Layer | Requirement |
| --- | --- |
| OS | Ubuntu 22.04+, Debian 12, Rocky 9, or comparable systemd-based distro (macOS for dev only) |
| CPU | Hardware virtualization extensions (Intel VT-x/AMD-V) enabled in BIOS |
| Node.js | v20 or v22 LTS (match `.nvmrc` if present) |
| Package Managers | `npm` 10+, `pip` 23+ |
| Virtualization | `libvirt-daemon`, `qemu-kvm`, `virtinst`, `bridge-utils` |
| Containers | Docker Engine 24+ with access to `/var/run/docker.sock` |
| Python tooling | `pip install websockify` for console proxying |
| Optional DB | MongoDB 6+ when `USE_MONGODB=true` |

---

## 3. System Preparation

```bash
# Ubuntu example
sudo apt update && sudo apt install -y \
  build-essential python3 python3-pip libvirt-daemon-system qemu-kvm \
  virtinst bridge-utils pkg-config docker.io git

# Enable libvirt + docker access for the machina user
sudo usermod -aG libvirt,docker "$USER"
newgrp libvirt
```

Validate dependencies:

```bash
node -v      # Expect v20+
npm -v       # Expect 10+
virsh list   # Works without sudo
sudo systemctl status docker
```

---

## 4. Repository & Dependencies

```bash
git clone https://github.com/4ngel2769/machina.git
cd machina
npm install
```

Create data scaffolding (users, quotas, VM metadata):

```bash
npm run init-data
```

> **Tip:** When running in MongoDB mode, execute `npm run migrate:mongodb` (or the `scripts/migrate-to-mongodb.*` scripts) after setting `USE_MONGODB=true`.

---

## 5. Environment Configuration

1. Duplicate `.env.example` → `.env`.
2. Mandatory keys:
   - `SERVER_HOST=0.0.0.0`
   - `SERVER_PORT=3000`
   - `PUBLIC_HOST=<public FQDN or IP>`
   - `NEXTAUTH_SECRET=$(openssl rand -base64 32)`
   - `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` (change before `npm run init-data`)
3. Console security knobs:
   - `WEBSOCKET_LISTEN_HOST=127.0.0.1` keeps raw VNC/SPICE proxies bound to loopback.
   - `WEBSOCKET_BASE_PORT=6080` seeds the auto-increment range used by `proxy-manager.cjs`.
   - `VNC_SESSION_TTL_SECONDS=1800` (or stricter) defines how long popup tokens remain valid.
4. Storage/networking knobs:
   - `USER_ISO_UPLOAD_DIR` absolute path for per-user ISO files (ensure permissions `750`).
   - `USER_VNET_BASE_OCTET`, `USER_VNET_MIN_SUBNET`, `USER_VNET_MAX_SUBNET` control tenant networks.
5. Optional MongoDB block: set `USE_MONGODB=true` and supply `MONGODB_URI`.

Keep configuration under version control only if secrets are injected via a secure store (e.g., `.env.local` managed by your secret manager).

---

## 6. First Run & Verification

```bash
# Development launch
npm run dev

# Production build
npm run build
npm start
```

Navigate to `http://<PUBLIC_HOST>:3000`, log in with the seeded admin user, and immediately change the password under **Settings → Profile**.

Smoke tests:

1. **VM lifecycle:** Create a VM, verify `virsh list` shows the domain, and confirm the Console tab mints a session in `logs/audit/audit.jsonl`.
2. **Container lifecycle:** Create/start a container, then open the in-browser terminal to verify Docker exec works.
3. **Uploads:** Use the ISO upload form to confirm files land inside `USER_ISO_UPLOAD_DIR/<userId>/`.
4. **Live stats:** Check the dashboard graphs to ensure the websocket pollers are reporting host metrics.

---

## 7. Secure Console Workflow Deep Dive

1. User opens the VM Console tab.
2. Machina reads libvirt display info (`/api/vms/[id]/display`).
3. `proxy-manager.cjs` launches (or reuses) a websockify process bound to `WEBSOCKET_LISTEN_HOST`.
4. `/api/vms/[id]/proxy/session` issues a signed popup token valid for `VNC_SESSION_TTL_SECONDS`.
5. The React console component injects the secure `popupUrl` or `wsPath` into noVNC.

**What to monitor:**
- `logs/proxy-manager.log` for crashes or orphaned proxies.
- `audit.jsonl` for `action: "upload"` and `action: "proxy_session"` entries.
- System firewall rules to ensure only the Next.js host can reach `WEBSOCKET_BASE_PORT + n`.

---

## 8. Operations & Maintenance

- **Quotas & tokens:** Use `/admin/quotas` and `/admin/tokens` to adjust plans after migration.
- **Backups:** Archive the `data/` directory and MongoDB dump nightly. Example cron entry:
  ```bash
  0 2 * * * /usr/bin/tar -czf /var/backups/machina-$(date +\%F).tgz /opt/machina/data
  ```
- **Linting:** `npm run lint` should stay clean before merging or deploying.
- **Proxy manager health:** Configure a process supervisor (systemd service) if you run the custom `server.js` to multiplex HTTP + WS traffic.
- **Upgrades:** Review release notes, run `npm install`, then re-run `npm run build` and restart the PM2/systemd service.

---

## 9. Troubleshooting Reference

| Symptom | Possible Cause | Resolution |
| --- | --- | --- |
| `CredentialsSignin` error on login | Missing `data/users.json` (init not run) | `npm run init-data` |
| Console popup stuck at "Connecting" | `PUBLIC_HOST` mismatch or proxies bound to 0.0.0.0 | Reissue env vars; keep `WEBSOCKET_LISTEN_HOST=127.0.0.1`; restart proxies |
| ISO upload rejected | Path escapes `USER_ISO_UPLOAD_DIR` or exceeds `MAX_USER_ISO_UPLOAD_BYTES` | Check sanitised filename and size limit |
| `virsh` command not found | libvirt packages missing | Install `libvirt-daemon-system` and restart |
| ESLint errors in CI | Local `.eslintignore` removed; run `npm run lint` and fix reported files | Fix code or update `eslint.config.mjs` |

---

**Need more detail?** Check [`DEPLOYMENT.md`](DEPLOYMENT.md).
