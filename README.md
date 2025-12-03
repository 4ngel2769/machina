# Machina

Machina is a unified operations plane for teams that manage both libvirt-based virtual machines and Docker containers. It blends RBAC-secured APIs, token-based quotas, and modern UX patterns (command palette, dashboards, inline help) into a single Next.js application.

## What Machina Delivers

- **Unified orchestration:** Create, monitor, and audit VMs and containers from one console.
- **Secure console access:** Built-in VNC/SPICE proxy manager with expiring session tokens and Cloudflare-friendly WebSocket popups.
- **Operational guardrails:** Multi-tenant quotas, token plans, rate limiting, audit/event logs, and automated backups.
- **Productivity tooling:** Command palette, contextual help, activity feeds, and real-time health widgets for operators.

## Who Uses Machina

- Internal platform teams that expose self-service virtualization to developers.
- Managed service providers offering dedicated VPS + container bundles.
- Security-conscious admins who need auditable console access without relying on VPNs.

## Platform Requirements

- Node.js 20 or 22
- Docker Engine with access to `/var/run/docker.sock`
- libvirt + QEMU/KVM (Linux host) for full VM lifecycle support
- Python 3 with `websockify` installed (`pip install websockify`)
- Optional MongoDB 6+ when `USE_MONGODB=true` in `.env`

## Quick Start

1. **Clone & install**
	```bash
	git clone https://github.com/4ngel2769/machina.git
	cd machina
	npm install
	```
2. **Seed configuration**
	```bash
	cp .env.example .env
	# Edit .env and set NEXTAUTH_SECRET, PUBLIC_HOST, default admin creds, etc.
	npm run init-data
	```

	> Need to reach Machina over plain HTTP (e.g., `http://192.168.x.x` on a LAN)? Set `AUTH_ALLOW_INSECURE_COOKIES=true` in `.env` so NextAuth issues non-secure cookies for that environment.
3. **Run Machina**
	```bash
	# Development
	npm run dev

	# Production
	npm run build
	npm start
	```
4. **Log in** at `http://localhost:3000` (or your `PUBLIC_HOST`) with the seeded admin user, then change the password immediately.

## Documentation

- **Public deployment guide:** `docs/PUBLIC_DOCUMENTATION.md` provides a full installation and hardening walkthrough for customer-facing environments.
- **Operator notes:** `DEPLOYMENT.md`, `REMOTE_ACCESS.md`, and `VNC_SETUP.md` capture internal runbooks, remote access nuances, and console tuning tips.

## License

Machina is available under the MIT License. See `LICENSE` for details.
