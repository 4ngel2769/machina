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

<h1 align="center" style="color:#00ff00; font-family:monospace;">Table of Contents</h1>

<div align="center">
	<ul style="display:flex; gap:8px;">
		<a href="#what-machina-delivers">What Machina Delivers</a>
		<a href="#who-uses-machina">Who Uses Machina</a>
		<a href="#platform-requirements">Platform Requirements</a>
		<a href="#quick-start">Quick Start</a>
		<a href="#documentation">Documentation</a>
		<a href="#license">License</a>
	</ul>
</div>

<h1 align="center" style="color:#00ff00; font-family:monospace;">What Machina Delivers</h1>
<tr>
<td width="50%" valign="top">

#### **Unified Orchestration**: Create, monitor, and audit VMs and containers from one console.

#### **Secure Console Access**: Built-in VNC/SPICE proxy manager with expiring session tokens and Cloudflare-friendly WebSocket popups.

</td>
<td width="50%" valign="top">

#### **Operational Guardrails**: Multi-tenant quotas, token plans, rate limiting, audit/event logs, and automated backups.

#### **Productivity Tooling**: Command palette, contextual help, activity feeds, and real-time health widgets for operators.

</td>
</tr>
</table>

<h1 align="center" style="color:#00ff00; font-family:monospace;">Who Uses Machina</h1>

| 👨‍💻 User Type | 🎯 Use Case |
|------------|-------------|
| **Internal Platform Teams** | Expose self-service virtualization to developers |
| **Managed Service Providers** | Offer dedicated VPS + container bundles |
| **Security-Conscious Admins** | Auditable console access without VPNs |

</div>

<h1 align="center" style="color:#00ff00; font-family:monospace;">Platform Requirements</h1>
<tr>
<td align="center" width="33%">

**Required**

• Node.js 20 or 22<br>
• Docker Engine<br>
• libvirt + QEMU/KVM<br>
• Python 3 + websockify

</td>
<td align="center" width="33%">

**Optional**

MongoDB 6+<br>
*(when `USE_MONGODB=true`)*

</td>
<td align="center" width="33%">

**Platform**

Linux (Ubuntu 22.04+)<br>
macOS (dev only)

</td>
</tr>
</table>

<h1 align="center" style="color:#00ff00; font-family:monospace;">Quick Start</h1>
<tr>
<td>

### 1. Clone & Install
```bash
git clone https://github.com/4ngel2769/machina.git
cd machina
npm install
```

</td>
</tr>
<tr>
<td>

### 2. Seed Configuration
```bash
cp .env.example .env
# Edit .env and set NEXTAUTH_SECRET, PUBLIC_HOST, default admin creds, etc.
npm run init-data
```

> [!TIP]
> Need to reach Machina over plain HTTP (e.g., `http://192.168.x.x` on a LAN)? Set `AUTH_ALLOW_INSECURE_COOKIES=true` in `.env` so NextAuth issues non-secure cookies for that environment.

</td>
</tr>
<tr>
<td>

### 3. Run Machina
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

</td>
</tr>
<tr>
<td>

### 4. Log In
Navigate to `http://localhost:3000` (or your `PUBLIC_HOST`) with the seeded admin user, then **change the password immediately**.

</td>
</tr>
</table>

<h1 align="center" style="color:#00ff00; font-family:monospace;">Documentation</h1>er">

|Document|Purpose|
|-------------:|:------------|
| [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) | Full installation and hardening walkthrough for production |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Initial setup, configuration, and post-deployment checklist |
| [`REMOTE_ACCESS.md`](REMOTE_ACCESS.md) | Remote access configuration and tunneling |
| [`VNC_SETUP.md`](VNC_SETUP.md) | Console proxy setup and tuning |

</div>

<h1 align="center" style="color:#00ff00; font-family:monospace;">License</h1>="center">

**Machina is available under the MIT License.**

See [`LICENSE`](LICENSE) for details.

<sub>Made with 💚 by 4ngel2769</sub>

</div>
