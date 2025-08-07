# Deployment Guide

## System Requirements

Machina expects the host to provide both virtualization and container tooling. Before deploying, make sure the target machine satisfies the following:

- **Operating system:** Linux distribution with systemd (Ubuntu 22.04+ recommended). macOS works for development only.
- **Node.js:** v20 or v22 LTS. Earlier versions are unsupported.
- **Docker Engine:** Required for container orchestration. Ensure the current user can access `/var/run/docker.sock`.
- **libvirt/KVM:** Needed for VM lifecycle operations. Install `libvirt-daemon`, `qemu-kvm`, and grant the Machina service user membership in the `libvirt` group.
- **Python + pip:** Used by the built-in websockify binary invoked via `lib/proxy-manager.cjs` for VNC/SPICE tunneling.
- **Optional MongoDB:** Enable if you plan to run in database-backed mode (`USE_MONGODB=true`).

Once the host meets these prerequisites, follow the steps below to bring Machina online.

## Initial Setup on Production Server

After deploying the application to your production server, follow these steps:

### 1. Install Dependencies

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

### 4. Build the Application

```bash
npm run build
```

### 5. Start the Server

```bash
npm start
```

The server will start on port 3000 by default.

## Default Login Credentials

- **Username:** `admin` (or value from `DEFAULT_ADMIN_USERNAME`)
- **Password:** `admin123` (or value from `DEFAULT_ADMIN_PASSWORD`)

⚠️ **IMPORTANT:** Change the default admin password immediately after first login!

Go to: Profile → Settings → Change password

## Troubleshooting

### Login fails with CredentialsSignin error

This usually means the `data/` directory doesn't exist or is empty.

**Solution:**
```bash
npm run init-data
```

### "Username already exists" error during init

The admin user was already created. You can either:
1. Delete `data/users.json` and run `npm run init-data` again
2. Or use the existing admin credentials

### Data directory not persisting after restart

Make sure the `data/` directory is:
1. Not in `.gitignore` (it shouldn't be)
2. Has proper write permissions: `chmod 755 data/`
3. Is owned by the user running the Node.js process

## File Locations

All persistent data is stored in the `data/` directory:

- `data/users.json` - User accounts and authentication
- `data/containers.json` - Container instances
- `data/vms.json` - Virtual machine instances
- `data/quotas.json` - User token balances and quotas
- `data/pricing-templates.json` - VM/Container pricing templates
- `data/token-requests.json` - Token request submissions
- `data/user-contracts.json` - Monthly subscription contracts

## Backup Recommendations

Regularly backup the entire `data/` directory:

```bash
# Create a backup
tar -czf machina-backup-$(date +%Y%m%d).tar.gz data/

# Restore from backup
tar -xzf machina-backup-YYYYMMDD.tar.gz
```

## Secure Console & Proxy Checklist

1. **Verify prerequisites:** Ensure `websockify` is installed (`pip install websockify`) and reachable in `$PATH`.
2. **Lock down proxy listeners:** Leave `WEBSOCKET_LISTEN_HOST` at `127.0.0.1` so only the Next.js server can reach raw VNC ports.
3. **Set a realistic TTL:** Tune `VNC_SESSION_TTL_SECONDS` to meet your risk posture (default 3600 seconds). Shorter TTLs reduce replay risk.
4. **Expose the correct public host:** `PUBLIC_HOST` must match the URL that end users load in their browsers; this value is embedded in popup URLs.
5. **Smoke test the console flow:** Start a VM, open its Console tab, and confirm that a secure popup session token is minted in the audit log.

## Post-Deployment Checklist

- ✅ Run `npm run lint` to ensure no local configuration drift introduces lint regressions before shipping changes.
- ✅ Change the default admin password immediately after first login.
- ✅ Configure a reverse proxy (Nginx/Caddy/Traefik) that terminates TLS and forwards WebSocket traffic to `SERVER_HOST:SERVER_PORT`.
- ✅ Enable regular backups of both the `data/` directory and persistent MongoDB volumes (if enabled).
- ✅ Review `logs/audit/audit.jsonl` weekly to verify console session issuance aligns with expectations.
