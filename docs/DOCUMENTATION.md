<div align="center">
<h1>Machina Deployment & Operations Guide</h1>
<h3>Complete Installation, Configuration & Validation Workflow</h3>

[![Documentation](https://img.shields.io/badge/Docs-Complete-success?style=flat)]()
[![Audience](https://img.shields.io/badge/Audience-Enterprise%20Ops-blue?style=flat)]()
[![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen?style=flat)]()

</div>

<p align="center">
<em>This document expands on the top-level README by walking through a full installation, configuration, and validation workflow for Machina. Share it with customer teams, solution architects, and DevSecOps engineers who need to stand up a cluster-quality instance rather than just clone the repo.</em>
</p>

<h1 align="center">Table of Contents</h1>

<div align="center">

[**Audience & Goals**](#1-audience--goals) • 
[**Platform Requirements**](#2-platform-requirements) • 
[**System Preparation**](#3-system-preparation) • 
[**Repository Setup**](#4-repository--dependencies) • 
[**Environment Config**](#5-environment-configuration) • 
[**First Run**](#6-first-run--verification) • 
[**Console Workflow**](#7-secure-console-workflow-deep-dive) • 
[**Operations**](#8-operations--maintenance) • 
[**Troubleshooting**](#9-troubleshooting-reference)

</div>

<h1 align="center">1. Audience & Goals</h1>

| 👥 Role | 🎯 Focus |
|---------|----------|
| **Platform Operators** | Manage libvirt VMs and Docker containers |
| **Managed Service Providers** | Secure multi-tenant deployments |
| **Enterprise IT Teams** | Quota/tokens configuration and operational hand-off |

</div>

<h1 align="center">2. Platform Requirements</h1>
<tr>
<td width="50%">

### Base System

| Component | Requirement |
|-----------|-------------|
| **OS** | Ubuntu 22.04+, Debian 12, Rocky 9<br>*(systemd-based, macOS for dev only)* |
| **CPU** | VT-x/AMD-V enabled in BIOS |
| **Node.js** | v20 or v22 LTS |
| **Package Mgrs** | npm 10+, pip 23+ |

</td>
<td width="50%">

### Virtualization & Containers

| Component | Requirement |
|-----------|-------------|
| **Virtualization** | libvirt-daemon, qemu-kvm,<br>virtinst, bridge-utils |
| **Containers** | Docker Engine 24+ |
| **Python** | websockify for proxying |
| **Optional** | MongoDB 6+ |

</td>
</tr>
</table>

<h1 align="center"> 3. System Preparation</h1>
<tr>
<td>

### Install System Packages (Ubuntu)
```bash
sudo apt update && sudo apt install -y \
  build-essential python3 python3-pip libvirt-daemon-system qemu-kvm \
  virtinst bridge-utils pkg-config docker.io git
```

</td>
</tr>
<tr>
<td>

### 👤 Configure User Access
```bash
sudo usermod -aG libvirt,docker "$USER"
newgrp libvirt
```

</td>
</tr>
<tr>
<td>

### Validate Dependencies
```bash
node -v      # Expect v20+
npm -v       # Expect 10+
virsh list   # Works without sudo
sudo systemctl status docker
```

</td>
</tr>
</table>

<h1 align="center">4. Repository & Dependencies</h1>
<tr>
<td>

### Clone & Install
```bash
git clone https://github.com/4ngel2769/machina.git
cd machina
npm install
```

</td>
</tr>
<tr>
<td>

### Initialize Data
```bash
npm run init-data
```

> [!TIP]
> When running in MongoDB mode, execute `npm run migrate:mongodb` (or the `scripts/migrate-to-mongodb.*` scripts) after setting `USE_MONGODB=true`.

</td>
</tr>
</table>

<h1 align="center">5. Environment Configuration</h1>

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

<h1 align="center">🚀 6. First Run & Verification</h1>

```bash
# Development launch
npm run dev

# Production build
npm run build
npm start
```

Navigate to `http://<PUBLIC_HOST>:3000`, log in with the seeded admin user, and immediately change the password under **Settings → Profile**.

### Smoke Tests

<table>
<tr>
<td width="25%" align="center">

**VM Lifecycle**

Create a VM, verify `virsh list`, check audit log

</td>
<td width="25%" align="center">

**Container Lifecycle**

Create/start container, test in-browser terminal

</td>
<td width="25%" align="center">

**Uploads**

Test ISO upload to `USER_ISO_UPLOAD_DIR`

</td>
<td width="25%" align="center">

**Live Stats**

Verify dashboard WebSocket metrics

</td>
</tr>
</table>

<h1 align="center">7. Secure Console Workflow Deep Dive</h1>

1. User opens the VM Console tab.
2. Machina reads libvirt display info (`/api/vms/[id]/display`).
3. `proxy-manager.cjs` launches (or reuses) a websockify process bound to `WEBSOCKET_LISTEN_HOST`.
4. `/api/vms/[id]/proxy/session` issues a signed popup token valid for `VNC_SESSION_TTL_SECONDS`.
5. The React console component injects the secure `popupUrl` or `wsPath` into noVNC.

### What to Monitor

<table>
<tr>
<td>

- `logs/proxy-manager.log` for crashes or orphaned proxies
- `audit.jsonl` for `action: "upload"` and `action: "proxy_session"` entries
- System firewall rules to ensure only Next.js host can reach `WEBSOCKET_BASE_PORT + n`

</td>
</tr>
</table>

<h1 align="center">8. Operations & Maintenance</h1>

- **Quotas & tokens:** Use `/admin/quotas` and `/admin/tokens` to adjust plans after migration.
- **Backups:** Archive the `data/` directory and MongoDB dump nightly. Example cron entry:
  ```bash
  0 2 * * * /usr/bin/tar -czf /var/backups/machina-$(date +\%F).tgz /opt/machina/data
  ```
- **Linting:** `npm run lint` should stay clean before merging or deploying.
- **Proxy manager health:** Configure a process supervisor (systemd service) if you run the custom `server.js` to multiplex HTTP + WS traffic.
- **Upgrades:** Review release notes, run `npm install`, then re-run `npm run build` and restart the PM2/systemd service.

<h1 align="center">9. Troubleshooting Reference</h1>

| Symptom | Possible Cause | Resolution |
| --- | --- | --- |
| `CredentialsSignin` error on login | Missing `data/users.json` (init not run) | `npm run init-data` |
| Console popup stuck at "Connecting" | `PUBLIC_HOST` mismatch or proxies bound to 0.0.0.0 | Reissue env vars; keep `WEBSOCKET_LISTEN_HOST=127.0.0.1`; restart proxies |
| ISO upload rejected | Path escapes `USER_ISO_UPLOAD_DIR` or exceeds `MAX_USER_ISO_UPLOAD_BYTES` | Check sanitised filename and size limit |
| `virsh` command not found | libvirt packages missing | Install `libvirt-daemon-system` and restart |
| ESLint errors in CI | Local `.eslintignore` removed; run `npm run lint` and fix reported files | Fix code or update `eslint.config.mjs` |

<div align="center">

<br>

**Need more detail?** Check [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`README.md`](../README.md)

<sub>Made with 💚 by 4ngel2769</sub>

</div>
