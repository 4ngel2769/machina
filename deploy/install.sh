#!/usr/bin/env bash
# machina production installer (blade).
# Idempotent; safe to re-run. Requires sudo.
set -euo pipefail

if [[ $EUID -eq 0 ]]; then echo "do NOT run as root; run as the operator user (uses sudo for specific steps)" && exit 1; fi

INSTALL_DIR="${INSTALL_DIR:-/home/$USER/machina}"
DATA_DIR="${DATA_DIR:-/var/lib/machina}"
STORAGE_DIR="${STORAGE_DIR:-/mnt/machina}"
SERVICE_NAME=machina

echo "==> install dir: ${INSTALL_DIR}"
echo "==> DB/data dir: ${DATA_DIR}"
echo "==> storage:     ${STORAGE_DIR}"

# --- dirs owned by the service user -------------------------------------------
sudo mkdir -p "$DATA_DIR" "$STORAGE_DIR"
sudo chown "$USER":"$USER" "$DATA_DIR" "$STORAGE_DIR"
# serial/ is not optional despite looking like it: the domain XML writes each
# guest's console to it, so a missing dir is a failed define, not a lost log.
for d in images vms seeds vnc tmp ssh serial iso; do mkdir -p "$STORAGE_DIR/$d"; done
chmod 1777 "$STORAGE_DIR/vnc"
chmod 700 "$DATA_DIR"

# --- deps ---------------------------------------------------------------------
if ! command -v virsh >/dev/null 2>&1; then
  echo "libvirt-clients missing; install: sudo apt install libvirt-daemon-system libvirt-clients qemu-system-x86 genisoimage"
  exit 1
fi
command -v tsx >/dev/null 2>&1 || true
command -v nft >/dev/null 2>&1 || echo "NOTE: nftables missing; guest isolation firewall will be skipped (sudo apt install nftables)"

# --- libvirt membership --------------------------------------------------------
groups | grep -qw kvm || echo "NOTE: add to kvm group: sudo usermod -aG kvm $USER (re-login needed)"
groups | grep -qw libvirt || echo "NOTE: add to libvirt group: sudo usermod -aG libvirt $USER (re-login needed)"

# --- guest isolation firewall ---------------------------------------------------
# A rented VM is untrusted. Without this table a guest can reach the control
# plane on :3999, the host's docker bridges and the tailnet; with it, only
# DHCP/DNS on the gateway and the public internet are reachable. Lives in the
# repo because it is part of the product's security model, not a local tweak.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if command -v nft >/dev/null 2>&1 && [[ -f "$SCRIPT_DIR/machina-gfw.nft" ]]; then
  sudo mkdir -p /etc/nftables.d
  sudo install -m 0644 "$SCRIPT_DIR/machina-gfw.nft" /etc/nftables.d/machina-gfw.nft
  sudo install -m 0644 "$SCRIPT_DIR/machina-gfw.service" /etc/systemd/system/machina-gfw.service
  # The table only makes sense once the bridge exists; virsh define/start of
  # machina0 happens on first boot of the app, so this may no-op now and is
  # re-applied on the next boot of the unit.
  sudo systemctl daemon-reload
  sudo systemctl enable machina-gfw.service
  sudo systemctl restart machina-gfw.service || true
  echo "==> guest isolation firewall installed (machina-gfw.service)"
else
  echo "NOTE: skipped guest isolation firewall (no nft or no deploy/machina-gfw.nft)"
fi

# Per-user tenant networks (virbr-mu*): same host-contact rules as machina0,
# plus a hard drop on any packet forwarded between two libvirt bridges — that
# is the only path a guest has to another tenant's VM.
if command -v nft >/dev/null 2>&1 && [[ -f "$SCRIPT_DIR/machina-vnets.nft" ]]; then
  sudo mkdir -p /etc/nftables.d
  sudo install -m 0644 "$SCRIPT_DIR/machina-vnets.nft" /etc/nftables.d/machina-vnets.nft
  sudo install -m 0644 "$SCRIPT_DIR/machina-vnets.service" /etc/systemd/system/machina-vnets.service
  sudo systemctl daemon-reload
  sudo systemctl enable machina-vnets.service
  sudo systemctl restart machina-vnets.service || true
  echo "==> tenant network isolation installed (machina-vnets.service)"
else
  echo "NOTE: skipped tenant network isolation (no nft or no deploy/machina-vnets.nft)"
fi

# --- secrets -------------------------------------------------------------------
if [[ ! -f "$DATA_DIR/machina.key" ]]; then
  openssl rand -hex 32 > "$DATA_DIR/machina.key"
  chmod 600 "$DATA_DIR/machina.key"
  echo "==> generated $DATA_DIR/machina.key (AES master key)"
fi

ENV_FILE="$DATA_DIR/machina.env"
if [[ ! -f "$ENV_FILE" ]]; then
  AUTH_SECRET=$(openssl rand -hex 32)
  ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | head -c 16)
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
  echo "==> wrote $ENV_FILE (chmod 600)"
fi

# --- systemd unit ---------------------------------------------------------------
NODE_BIN=$(command -v node || true)
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(ls -1 /home/$USER/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)"
fi
if [[ -z "$NODE_BIN" ]]; then echo "node not found (nvm?)" && exit 1; fi
NODE_DIR="$(dirname "$NODE_BIN")"
TSX_CLI="$INSTALL_DIR/node_modules/tsx/dist/cli.mjs"
[[ -f "$TSX_CLI" ]] || echo "NOTE: tsx CLI missing at $TSX_CLI (bun install in $INSTALL_DIR first)"

cat > /tmp/machina.service <<EOF2
[Unit]
Description=machina VM rental platform
After=network-online.target libvirtd.service
Wants=network-online.target libvirtd.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$DATA_DIR/machina.env
Environment=PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_BIN $TSX_CLI server.ts
Restart=always
RestartSec=5
# libvirt unix socket + kvm access (group names must exist or exec fails 216/GROUP)
SupplementaryGroups=libvirt kvm

[Install]
WantedBy=multi-user.target
EOF2
sudo cp /tmp/machina.service /etc/systemd/system/machina.service
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sleep 2
sudo systemctl status "$SERVICE_NAME" --no-pager -l | head -12 || true

# --- nightly backup timer --------------------------------------------------------
BACKUP_DIR="${MACHINA_BACKUP_DIR:-/mnt/backups/machina}"
if [[ -f "$SCRIPT_DIR/machina-backup.sh" ]]; then
  sudo mkdir -p "$BACKUP_DIR"
  sudo install -m 0755 "$SCRIPT_DIR/../scripts/machina-backup.sh" /usr/local/bin/machina-backup.sh
  sed -e "s|/home/angel/machina/scripts/machina-backup.sh|/usr/local/bin/machina-backup.sh|" \
      -e "s|MACHINA_BACKUP_DIR=/mnt/8tbv1/backups/machina|MACHINA_BACKUP_DIR=$BACKUP_DIR|" \
      -e "s|MACHINA_DB_PATH=/var/lib/machina/machina.db|MACHINA_DB_PATH=$DATA_DIR/machina.db|" \
      -e "s|MACHINA_STORAGE_DIR=/mnt/8tbv1/machina|MACHINA_STORAGE_DIR=$STORAGE_DIR|" \
      "$SCRIPT_DIR/machina-backup.service" > /tmp/machina-backup.service
  sudo install -m 0644 /tmp/machina-backup.service /etc/systemd/system/machina-backup.service
  sudo install -m 0644 "$SCRIPT_DIR/machina-backup.timer" /etc/systemd/system/machina-backup.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now machina-backup.timer
  echo "==> nightly backup timer installed (03:15 + up to 20m jitter -> $BACKUP_DIR)"
else
  echo "NOTE: scripts/machina-backup.sh missing; backup timer skipped"
fi

echo
echo "Done. Admin credentials in $DATA_DIR/machina.env (ADMIN_PASSWORD)."
echo "The service listens on SERVER_PORT (default 3999)."
