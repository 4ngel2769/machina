#!/usr/bin/env bash
# machina smart installer — OS detection, dependency bootstrap, service setup.
# Coolify-style: colored checks, clear ok/warn/fail, progress steps.
#
#   curl -fsSL https://raw.githubusercontent.com/4ngel2769/machina/maino/install.sh | bash
#
# Env overrides:
#   MACHINA_HOME    install dir          (default /opt/machina)
#   MACHINA_REPO    git URL              (default github 4ngel2769/machina maino)
#   MACHINA_DATA    data dir             (default /var/lib/machina)
#   MACHINA_STORAGE storage dir          (default /var/lib/machina/storage)
#   MACHINA_BACKUP  backup dir            (default /var/lib/machina/backups)
#   MACHINA_YES=1   non-interactive: auto-accept dependency installs
#   NO_COLOR        disable colors
set -euo pipefail

# --- colors / glyphs ----------------------------------------------------------
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_GRN=$'\033[32m'
  C_YEL=$'\033[33m'; C_BLU=$'\033[34m'; C_CYN=$'\033[36m'; C_BOLD=$'\033[1m'
else
  C_RESET=; C_DIM=; C_RED=; C_GRN=; C_YEL=; C_BLU=; C_CYN=; C_BOLD=
fi
ok()   { printf '  %s✔%s %s\n' "$C_GRN" "$C_RESET" "$*"; }
bad()  { printf '  %s✖%s %s\n' "$C_RED" "$C_RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_YEL" "$C_RESET" "$*"; }
info() { printf '  %s→%s %s\n' "$C_CYN" "$C_RESET" "$*"; }
step() { printf '\n%s%s▸ %s%s\n' "$C_BOLD" "$C_BLU" "$*" "$C_RESET"; }
die()  { printf '\n%s✖ %s%s\n' "$C_RED" "$*" "$C_RESET" >&2; exit 1; }

SUDO=""
if [[ $EUID -eq 0 ]]; then
  warn "running as root — prefer a normal user; sudo will be used for privileged steps"
else
  command -v sudo >/dev/null 2>&1 || die "sudo not found and you are not root"
  SUDO="sudo -n"
  $SUDO -v 2>/dev/null || { printf 'sudo password: '; sudo -v; }
fi

INSTALL_DIR="${MACHINA_HOME:-/opt/machina}"
DATA_DIR="${MACHINA_DATA:-/var/lib/machina}"
STORAGE_DIR="${MACHINA_STORAGE:-$DATA_DIR/storage}"
BACKUP_DIR="${MACHINA_BACKUP:-$DATA_DIR/backups}"
REPO_URL="${MACHINA_REPO:-https://github.com/4ngel2769/machina.git}"
REPO_BRANCH="${MACHINA_BRANCH:-maino}"
AUTO_YES="${MACHINA_YES:-0}"

printf '\n%s%s  machina installer%s\n' "$C_BOLD" "$C_CYN" "$C_RESET"
printf '%s  self-hosted VM rental · libvirt + Next.js%s\n' "$C_DIM" "$C_RESET"

# --- step 1: OS detection -----------------------------------------------------
step "detecting OS"
. /etc/os-release 2>/dev/null || die "cannot read /etc/os-release — unsupported OS"
OS_ID="${ID:-unknown}"; OS_LIKE="${ID_LIKE:-}"
ARCH="$(uname -m)"
info "os: $PRETTY_NAME ($OS_ID) · arch: $ARCH"

pkg_install() {  # pkg_install <manager> <pkgs...>
  local mgr="$1"; shift
  case "$mgr" in
    apt)     $SUDO apt-get update -qq && $SUDO apt-get install -y -qq "$@" ;;
    dnf)     $SUDO dnf install -y "$@" ;;
    yum)     $SUDO yum install -y "$@" ;;
    pacman)  $SUDO pacman -Sy --noconfirm "$@" ;;
    zypper)  $SUDO zypper --non-interactive install "$@" ;;
    *)       return 1 ;;
  esac
}

have_pkg_mgr() {
  for m in apt-get dnf yum pacman zypper; do command -v "$m" >/dev/null 2>&1 && { echo "$m"; return; }; done
  echo ""
}
PKG_MGR="$(have_pkg_mgr)"
[[ -n "$PKG_MGR" ]] || die "no supported package manager (apt/dnf/yum/pacman/zypper)"
info "package manager: $PKG_MGR"

# --- step 2: base tools -------------------------------------------------------
step "checking base tools"
MISSING_BASE=()
for t in git curl ca-certificates; do
  command -v "$t" >/dev/null 2>&1 && ok "$t" || MISSING_BASE+=("$t")
done
if (( ${#MISSING_BASE[@]} )); then
  warn "missing: ${MISSING_BASE[*]}"
  if [[ "$AUTO_YES" == "1" ]]; then
    info "auto-installing (MACHINA_YES=1)"
    pkg_install "$PKG_MGR" "${MISSING_BASE[@]}" || die "could not install ${MISSING_BASE[*]}"
  else
    printf '  install %s with %s? [Y/n] ' "${MISSING_BASE[*]}" "$PKG_MGR"
    read -r a; [[ "$a" =~ ^[Nn] ]] && die "aborted — install them manually and re-run"
    pkg_install "$PKG_MGR" "${MISSING_BASE[@]}" || die "install failed"
  fi
  for t in git curl; do command -v "$t" >/dev/null 2>&1 || die "$t still missing"; done
  ok "base tools ready"
else
  ok "base tools present"
fi

# --- step 3: node.js >= 20 ----------------------------------------------------
step "checking node.js"
node_ok() { command -v node >/dev/null 2>&1 && [[ "$(node -v | sed 's/v//;s/\..*//')" -ge 20 ]]; }
if node_ok; then
  ok "node $(node -v)"
else
  warn "node.js >= 20 not found (have: $(command -v node >/dev/null && node -v || echo none))"
  if [[ "$AUTO_YES" == "1" || "$PKG_MGR" == "apt" || "$OS_ID" == *debian* || "$OS_ID" == *ubuntu* ]]; then
    info "installing Node.js 22 via NodeSource"
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - >/dev/null
    pkg_install apt nodejs || die "nodejs install failed"
  elif [[ "$PKG_MGR" == "dnf" || "$PKG_MGR" == "yum" ]]; then
    info "installing nodejs from distro repos"
    pkg_install "$PKG_MGR" nodejs || die "nodejs install failed"
    node_ok || warn "distro node may be < 20 — if the app fails, install NodeSource manually"
  else
    die "install Node.js >= 20 yourself, then re-run"
  fi
  node_ok || die "node.js >= 20 required"
  ok "node $(node -v)"
fi
command -v npm >/dev/null 2>&1 || die "npm missing (bundled with node normally)"

# --- step 4: libvirt / qemu / misc --------------------------------------------
step "checking virtualization stack"
WANT_PKGS=()
case "$PKG_MGR" in
  apt)    WANT_PKGS=(libvirt-daemon-system libvirt-clients qemu-system-x86 genisoimage nftables sqlite3 xz-utils build-essential python3) ;;
  dnf|yum) WANT_PKGS=(libvirt qemu-kvm libvirt-client genisoimage nftables sqlite xz gcc make python3) ;;
  pacman) WANT_PKGS=(libvirt qemu-desktop spice gtk-vnc nftables sqlite xz base-devel python) ;;
  zypper) WANT_PKGS=(libvirt qemu-x86_64 libvirt-client genisoimage nftables sqlite3 xz gcc make python3) ;;
esac

# which are actually missing?
MISSING_PKGS=()
check_cmd() { command -v "$1" >/dev/null 2>&1; }
if ! check_cmd virsh; then MISSING_PKGS+=("${WANT_PKGS[0]}"); fi
if ! check_cmd qemu-system-x86_64 && ! check_cmd qemu-kvm; then MISSING_PKGS+=("${WANT_PKGS[1]}"); fi
if ! check_cmd genisoimage && ! check_cmd xorriso; then MISSING_PKGS+=("${WANT_PKGS[2]}"); fi
if ! check_cmd nft; then MISSING_PKGS+=("${WANT_PKGS[3]}"); fi
if ! check_cmd sqlite3; then MISSING_PKGS+=("${WANT_PKGS[4]}"); fi

if (( ${#MISSING_PKGS[@]} )); then
  warn "missing packages: ${MISSING_PKGS[*]}"
  if [[ "$AUTO_YES" == "1" ]]; then
    info "auto-installing"
    pkg_install "$PKG_MGR" "${WANT_PKGS[@]}" || die "package install failed"
  else
    printf '  install virtualization stack with %s? [Y/n] ' "$PKG_MGR"
    read -r a; [[ "$a" =~ ^[Nn] ]] && die "aborted"
    pkg_install "$PKG_MGR" "${WANT_PKGS[@]}" || die "package install failed"
  fi
else
  ok "virtualization stack present"
fi

# groups + libvirtd
for g in libvirt kvm; do
  if getent group "$g" >/dev/null; then ok "group $g exists"; else warn "group $g missing — packages may not have created it"; fi
done
if ! id -nG | tr ' ' '\n' | grep -qx libvirt; then
  info "adding $USER to libvirt + kvm groups"
  $SUDO usermod -aG libvirt,kvm "$USER" || warn "usermod failed — add manually: sudo usermod -aG libvirt,kvm $USER"
  warn "group membership applies at next login — if this is your first install, log out/in"
fi

if systemctl list-unit-files libvirtd.service >/dev/null 2>&1 || systemctl list-unit-files libvirtd.socket >/dev/null 2>&1; then
  $SUDO systemctl enable --now libvirtd.service 2>/dev/null || $SUDO systemctl enable --now libvirtd.socket 2>/dev/null || warn "could not enable libvirtd"
  ok "libvirtd enabled"
else
  warn "no libvirtd unit found — is libvirt installed?"
fi

# --- step 5: clone / update ---------------------------------------------------
step "installing application to $INSTALL_DIR"
if [[ -f "$INSTALL_DIR/server.ts" && -d "$INSTALL_DIR/.git" ]]; then
  info "existing checkout — pulling latest"
  git -C "$INSTALL_DIR" fetch --quiet origin
  git -C "$INSTALL_DIR" checkout --quiet "$REPO_BRANCH" 2>/dev/null || git -C "$INSTALL_DIR" checkout --quiet -b "$REPO_BRANCH" --track "origin/$REPO_BRANCH" 2>/dev/null || true
  git -C "$INSTALL_DIR" pull --ff-only --quiet || warn "pull failed — continuing with what's there"
else
  $SUDO mkdir -p "$INSTALL_DIR"
  $SUDO chown "$USER":"$USER" "$INSTALL_DIR"
  git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR" || die "git clone failed"
fi
ok "source ready"

# --- step 6: npm deps + build --------------------------------------------------
step "installing node dependencies"
cd "$INSTALL_DIR"
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund || die "npm ci failed"
else
  npm install --no-audit --no-fund || die "npm install failed"
fi
ok "dependencies installed"

step "building"
npm run build || die "next build failed"
ok "build complete"

# --- step 7: data dirs + secrets ----------------------------------------------
step "configuring data directories"
$SUDO mkdir -p "$DATA_DIR" "$STORAGE_DIR" "$BACKUP_DIR"
$SUDO chown -R "$USER":"$USER" "$DATA_DIR" "$STORAGE_DIR" "$BACKUP_DIR"
for d in images vms seeds vnc tmp ssh serial iso; do mkdir -p "$STORAGE_DIR/$d"; done
chmod 1777 "$STORAGE_DIR/vnc" 2>/dev/null || true
chmod 700 "$DATA_DIR" 2>/dev/null || true
ok "dirs ready: $STORAGE_DIR"

if [[ ! -f "$DATA_DIR/machina.key" ]]; then
  openssl rand -hex 32 > "$DATA_DIR/machina.key" && chmod 600 "$DATA_DIR/machina.key"
  ok "generated machina.key"
fi

ENV_FILE="$DATA_DIR/machina.env"
if [[ ! -f "$ENV_FILE" ]]; then
  AUTH_SECRET="$(openssl rand -hex 32)"
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 16)"
  cat > "$ENV_FILE" <<EOF
MACHINA_STORAGE_DIR=$STORAGE_DIR
MACHINA_DB_PATH=$DATA_DIR/machina.db
AUTH_SECRET=$AUTH_SECRET
AUTH_TRUST_HOST=true
ADMIN_USER=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD
NODE_ENV=production
SERVER_PORT=3999
EOF
  chmod 600 "$ENV_FILE"
  ok "wrote $ENV_FILE"
else
  ok "env file exists — leaving it alone"
fi

# --- step 8: systemd units -----------------------------------------------------
step "installing systemd units"
NODE_BIN="$(command -v node)"
NODE_DIR="$(dirname "$NODE_BIN")"
TSX_CLI="$INSTALL_DIR/node_modules/tsx/dist/cli.mjs"
[[ -f "$TSX_CLI" ]] || die "tsx CLI missing at $TSX_CLI — npm install incomplete?"

cat > /tmp/machina.service.$$ <<EOF2
[Unit]
Description=machina VM rental platform
After=network-online.target libvirtd.service
Wants=network-online.target libvirtd.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_FILE
Environment=PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_BIN $TSX_CLI server.ts
Restart=always
RestartSec=5
SupplementaryGroups=libvirt kvm

[Install]
WantedBy=multi-user.target
EOF2
$SUDO mv /tmp/machina.service.$$ /etc/systemd/system/machina.service
ok "machina.service"

# guest isolation firewall
if [[ -f "$INSTALL_DIR/deploy/machina-gfw.nft" && -f "$INSTALL_DIR/deploy/machina-gfw.service" ]]; then
  $SUDO mkdir -p /etc/nftables.d
  $SUDO install -m 0644 "$INSTALL_DIR/deploy/machina-gfw.nft" /etc/nftables.d/machina-gfw.nft
  $SUDO install -m 0644 "$INSTALL_DIR/deploy/machina-gfw.service" /etc/systemd/system/machina-gfw.service
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now machina-gfw.service 2>/dev/null || warn "machina-gfw failed (bridge may not exist yet — it retries on boot)"
  ok "machina-gfw.service"
fi

# backup units
if [[ -f "$INSTALL_DIR/scripts/machina-backup.sh" ]]; then
  $SUDO install -m 0755 "$INSTALL_DIR/scripts/machina-backup.sh" /usr/local/bin/machina-backup.sh
  cat > /tmp/machina-backup.service.$$ <<EOF3
[Unit]
Description=machina backup (db + images/seeds/isos)
After=machina.service

[Service]
Type=oneshot
Environment=MACHINA_DB_PATH=$DATA_DIR/machina.db
Environment=MACHINA_STORAGE_DIR=$STORAGE_DIR
Environment=MACHINA_BACKUP_DIR=$BACKUP_DIR
ExecStart=/usr/local/bin/machina-backup.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
EOF3
  $SUDO mv /tmp/machina-backup.service.$$ /etc/systemd/system/machina-backup.service
  [[ -f "$INSTALL_DIR/deploy/machina-backup.timer" ]] && $SUDO install -m 0644 "$INSTALL_DIR/deploy/machina-backup.timer" /etc/systemd/system/machina-backup.timer
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now machina-backup.timer 2>/dev/null && ok "machina-backup.timer" || warn "backup timer not enabled"
fi

# mach CLI
if [[ -f "$INSTALL_DIR/scripts/mach" ]]; then
  $SUDO install -m 0755 "$INSTALL_DIR/scripts/mach" /usr/local/bin/mach
  ok "mach CLI installed"
fi

# --- step 9: start --------------------------------------------------------------
step "starting machina"
$SUDO systemctl enable --now machina.service
sleep 3
if systemctl is-active --quiet machina.service; then
  ok "machina.service is active"
else
  bad "machina.service failed — check: journalctl -u machina.service -n 50"
fi

# --- done ----------------------------------------------------------------------
printf '\n%s%s  install complete%s\n' "$C_BOLD" "$C_GRN" "$C_RESET"
printf '  panel:     http://127.0.0.1:3999\n'
printf '  admin:     %s / (see %s)\n' "$(grep ADMIN_USER "$ENV_FILE" | cut -d= -f2)" "$ENV_FILE"
printf '  cli:       mach status\n'
printf '  docs:      %s/docs/DEPLOYMENT.md\n\n' "$INSTALL_DIR"
warn "put it behind TLS (tailscale serve / reverse proxy) before real use"
