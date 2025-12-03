<div align="center">
	<h1>Machina</h1>
	<h3>Unified Operations Plane for VMs & Containers</h3>
	<div>
		<a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Node.js-20%20%7C%2022-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js" /></a>
		<a href="https://nextjs.org/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Next.js-16.0-000000?style=flat&logo=next.js&logoColor=white" alt="Next.js" /></a>
		<a href="https://docker.com/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Docker-24%2B-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker" /></a>
		<a href="https://libvirt.org/" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/libvirt-KVM-FF6600?style=flat" alt="libvirt" /></a>
		<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" /></a>
	</div>
</div>

<p align="center">
Machina is a unified operations plane for teams that manage both libvirt-based virtual machines and Docker containers. It blends RBAC-secured APIs, token-based quotas, and modern UX patterns (command palette, dashboards, inline help) into a single Next.js application.
</p>

## Table of Contents

- [What Machina Delivers](#what-machina-delivers)
- [Who Uses Machina](#who-uses-machina)
- [Platform Requirements](#platform-requirements)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [License](#license)

<h1>What Machina Delivers</h1>

**Unified Orchestration**: Create, monitor, and audit VMs and containers from one console.

**Secure Console Access**: Built-in VNC/SPICE proxy manager with expiring session tokens and Cloudflare-friendly WebSocket popups.

**Operational Guardrails**: Multi-tenant quotas, token plans, rate limiting, audit/event logs, and automated backups.

**Productivity Tooling**: Command palette, contextual help, activity feeds, and real-time health widgets for operators.

<h1>Who Uses Machina</h1>

| User Type | Use Case |
|------------|-------------|
| **Internal Platform Teams** | Expose self-service virtualization to developers |
| **Managed Service Providers** | Offer dedicated VPS + container bundles |
| **Security-Conscious Admins** | Auditable console access without VPNs |

</div>

### Platform Requirements

**Required**

- Node.js 20 or 22<br>
- Docker Engine<br>
- libvirt + QEMU/KVM<br>
- Python 3 + websockify

**Optional**

MongoDB 6+ *(when `USE_MONGODB=true`)*

**Platform**

Linux (Ubuntu 22.04+)<br>
macOS (dev only)


# Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/4ngel2769/machina.git
cd machina
npm install
```

### 2. Seed Configuration
```bash
cp .env.example .env
# Edit .env and set NEXTAUTH_SECRET, PUBLIC_HOST, default admin creds, etc.
npm run init-data
```

> [!TIP]
> Need to reach Machina over plain HTTP (e.g., `http://192.168.x.x` on a LAN)? Set `AUTH_ALLOW_INSECURE_COOKIES=true` in `.env` so NextAuth issues non-secure cookies for that environment.

### 3. Run Machina
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### 4. Log In
Navigate to `http://localhost:3000` (or your `PUBLIC_HOST`) with the seeded admin user, then **change the password immediately**.

# Documentation

|Document|Purpose|
|-------------:|:------------|
| [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) | Full installation and hardening walkthrough for production |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Initial setup, configuration, and post-deployment checklist |
| [`REMOTE_ACCESS.md`](REMOTE_ACCESS.md) | Remote access configuration and tunneling |
| [`VNC_SETUP.md`](VNC_SETUP.md) | Console proxy setup and tuning |

# License

**Machina is available under the MIT License.**

See [`LICENSE`](LICENSE) for details.

<div align="center">Made with 💚 by 4ngel2769</div>
