<div align="center">
    <h1>🚀 Deployment Guide</h1>
    <h3>Production Setup & Configuration for Machina</h3>

[![Status](https://img.shields.io/badge/Status-Production%20Ready-success?style=flat)]()
[![Node.js](https://img.shields.io/badge/Node.js-20%20%7C%2022-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Required-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com/)

</div>

# Table of Contents

- [**System Requirements**](#system-requirements)
- [**Containerized Deployment**](#containerized-deployment-docker--compose)
- [**Initial Setup**](#initial-setup-on-production-server)
- [**Configuration**](#3-configure-environment-variables)
- [**Default Credentials**](#default-login-credentials)
- [**Troubleshooting**](#troubleshooting)
- [**Backup**](#backup-recommendations)
- [**Security**](#secure-console--proxy-checklist)
- [**Post-Deployment**](#post-deployment-checklist)

# System Requirements

### Core Requirements

| Component | Requirement |
|-----------|-------------|
| **OS** | Linux with systemd (Ubuntu 22.04+)<br>*macOS for dev only* |
| **Node.js** | v20 or v22 LTS |
| **Docker** | Engine 24+ with socket access |
| **libvirt/KVM** | `libvirt-daemon`, `qemu-kvm` |
| **Python** | 3.x with `websockify` |

### Optional Components

| Component | Purpose |
|-----------|----------|
| **MongoDB** | Enable with `USE_MONGODB=true` |
| **Reverse Proxy** | TLS termination (Nginx/Caddy) |
| **Process Manager** | PM2/systemd for service |

> [!TIP]
> Ensure the Machina user is in `libvirt` and `docker` groups.

# Containerized Deployment (Docker & Compose)

Machina now ships with a production-ready `Dockerfile` and `docker-compose.example.yml`. Containerizing the web tier lets you keep libvirt, QEMU/KVM, and Docker running natively on the host while exposing their sockets to the Machina container.

### Prerequisites

- Host must already run `libvirtd`, `qemu-kvm`, and Docker Engine.
- Bind mount the host sockets: `/var/run/libvirt/libvirt-sock` and `/var/run/docker.sock`.
- When the sockets are root-owned, run the container as root (default) or inject the matching group IDs.

### Steps

1. Copy `.env.example` → `.env` and set at minimum:
    - `NEXTAUTH_SECRET`
    - `PUBLIC_HOST`
    - `LIBVIRT_DEFAULT_URI=qemu+unix:///system?socket=/var/run/libvirt/libvirt-sock`
2. Capture the socket group IDs so non-root runs can access them:

    ```bash
    export DOCKER_GID=$(stat -c %g /var/run/docker.sock)
    export LIBVIRT_GID=$(stat -c %g /var/run/libvirt/libvirt-sock)
    ```

3. Build and run the container with the supplied compose file (adjust paths/ports as needed):

    ```bash
    docker compose -f docker-compose.example.yml up -d --build
    ```

The compose service mounts `./data` and `./logs` so initialization (`npm run init-data`) persists, and it exposes port `3000` by default. Verify connectivity from inside the container when it first boots:

```bash
docker exec -it machina virsh -c "$LIBVIRT_DEFAULT_URI" list --all
docker exec -it machina docker ps
```

If either command fails, confirm the sockets are mounted, group IDs match, and `LIBVIRT_DEFAULT_URI` points to the mounted socket.

# Initial Setup on Production Server

After deploying the application to your production server, follow these steps:

### 1. Install Dependenciesies

```bash
npm install
```

### 2. Initialize Data Directory

This creates the `data/` directory and all necessary JSON files, plus the default admin user:

```bash
npm run init-data
```

You should see output like:
```
🔧 Initializing data directory...
✓ Created data/ directory
✓ Created users.json
✓ Created containers.json
✓ Created vms.json
✓ Created quotas.json
✓ Created pricing-templates.json
✓ Created token-requests.json
✓ Created user-contracts.json

👤 Initializing users...
[Auth] No users found. Creating default admin user...
[Auth] ✓ Default admin user created
[Auth]   Username: admin
[Auth]   Password: admin123
[Auth] ⚠️  IMPORTANT: Change the default password immediately!

✅ Initialization complete!
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and update the following minimum set:

```bash
SERVER_HOST=0.0.0.0           # Listen on all interfaces
PUBLIC_HOST=machina.example.com  # Hostname clients will use
WEBSOCKET_LISTEN_HOST=127.0.0.1  # Keep VNC proxies loopback-only
VNC_SESSION_TTL_SECONDS=3600     # Expiry window for issued console tokens
DEFAULT_ADMIN_USERNAME=admin     # Change before init
DEFAULT_ADMIN_PASSWORD=changeme! # Change before init
```

Adjust `USER_ISO_UPLOAD_DIR`, `USER_VNET_*`, and MongoDB settings to match your infrastructure. **Always** set `NEXTAUTH_SECRET` to a freshly generated value (`openssl rand -base64 32`).

### 4. Build the Applicationtion

```bash
npm run build
```

### 5. Start the Serverver

```bash
npm start
```

*The server will start on port 3000 by default.*


# Default Login Credentials

| Field | Value |
|----------|----------|
| **Username** | `admin` *(or `DEFAULT_ADMIN_USERNAME` value)* |
| **Password** | `admin123` *(or `DEFAULT_ADMIN_PASSWORD` value)* |

> [!WARNING]
> **IMPORTANT:** Change the default admin password immediately after first login!
> 
> **Navigate to:** Profile → Settings → Change password

# Troubleshooting

### Login fails with CredentialsSignin error

**Cause:** The `data/` directory doesn't exist or is empty.

**Solution:**
```bash
npm run init-data
```

### "Username already exists" error during init

**Cause:** The admin user was already created.

**Solution:** Choose one:
1. Delete `data/users.json` and run `npm run init-data` again
2. Use the existing admin credentials

### Data directory not persisting after restart

**Check these items:**
- ✅ Not in `.gitignore` (it shouldn't be)
- ✅ Proper write permissions: `chmod 755 data/`
- ✅ Owned by the Node.js process user

# File Locationsr"

**All persistent data is stored in the `data/` directory:**

| File | Purpose |
|---------:|:------------|
| `data/users.json` | User accounts and authentication |
| `data/containers.json` | Container instances |
| `data/vms.json` | Virtual machine instances |
| `data/quotas.json` | User token balances and quotas |
| `data/pricing-templates.json` | VM/Container pricing templates |
| `data/token-requests.json` | Token request submissions |
| `data/user-contracts.json` | Monthly subscription contracts |

# Backup Recommendations

### Create a backup
```bash
tar -czf machina-backup-$(date +%Y%m%d).tar.gz data/
```

### Restore from backup
```bash
tar -xzf machina-backup-YYYYMMDD.tar.gz
```

> [!TIP]
> **Best Practice:** Schedule daily backups via cron and store in a secure off-site location.

# Secure Console & Proxy Checklist

- ✅ **Verify prerequisites:** Ensure `websockify` is installed (`pip install websockify`) and reachable in `$PATH`.
- ✅ **Lock down proxy listeners:** Leave `WEBSOCKET_LISTEN_HOST` at `127.0.0.1` so only the Next.js server can reach raw VNC ports.
- ✅ **Set a realistic TTL:** Tune `VNC_SESSION_TTL_SECONDS` to meet your risk posture (default 3600 seconds). Shorter TTLs reduce replay risk.
- ✅ **Expose the correct public host:** `PUBLIC_HOST` must match the URL that end users load in their browsers; this value is embedded in popup URLs.
- ✅ **Smoke test the console flow:** Start a VM, open its Console tab, and confirm that a secure popup session token is minted in the audit log.

# Post-Deployment Checklist

- ✅ Run `npm run lint` to ensure no local configuration drift introduces lint regressions before shipping changes.
- ✅ **Change the default admin password** immediately after first login.
- ✅ Configure a reverse proxy (Nginx/Caddy/Traefik) that terminates TLS and forwards WebSocket traffic to `SERVER_HOST:SERVER_PORT`.
- ✅ Enable regular backups of both the `data/` directory and persistent MongoDB volumes (if enabled).
- ✅ Review `logs/audit/audit.jsonl` weekly to verify console session issuance aligns with expectations.

<div align="center">

<sub> For more details, see [DOCUMENTATION.md](DOCUMENTATION.md) and [README.md](../README.md)</sub>

</div>
