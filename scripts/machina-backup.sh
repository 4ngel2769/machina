#!/usr/bin/env bash
# machina backup: SQLite DB (via .backup, safe on a live WAL db) + the
# non-disposable storage tree (images, seeds, isos, machina.key).
#
# Guest overlays under vms/ are deliberately excluded: a stopped overlay is
# reproducible from base image + seed, and a *running* overlay copied mid-write
# is corrupt anyway. Delete this VM's data via the panel instead.
#
# Destinations are overridable; defaults match the production unit on blade.
set -euo pipefail

DB_PATH="${MACHINA_DB_PATH:-/var/lib/machina/machina.db}"
STORAGE_DIR="${MACHINA_STORAGE_DIR:-/mnt/8tbv1/machina}"
BACKUP_ROOT="${MACHINA_BACKUP_DIR:-/mnt/8tbv1/backups/machina}"
KEEP="${MACHINA_BACKUP_KEEP:-7}"
DATE="$(date +%F-%H%M)"
DEST="$BACKUP_ROOT/$DATE"

command -v sqlite3 >/dev/null || { echo "sqlite3 required" >&2; exit 1; }
command -v rsync >/dev/null || { echo "rsync required" >&2; exit 1; }
[ -f "$DB_PATH" ] || { echo "db not found: $DB_PATH" >&2; exit 1; }
[ -d "$STORAGE_DIR" ] || { echo "storage dir not found: $STORAGE_DIR" >&2; exit 1; }

mkdir -p "$DEST"

echo "[machina-backup] $DATE -> $DEST"

# Consistent snapshot of the live database; .backup handles WAL correctly.
sqlite3 "$DB_PATH" ".backup '$DEST/machina.db'"

# The master key is not inside storageDir; losing it makes every stored
# password unreadable, so it travels with the backup.
KEY_SRC="$(dirname "$DB_PATH")/machina.key"
[ -f "$KEY_SRC" ] && install -m 0600 "$KEY_SRC" "$DEST/machina.key"

# Non-disposable storage: base images, seeds, uploaded ISOs.
for sub in images seeds iso; do
  [ -d "$STORAGE_DIR/$sub" ] && rsync -a --delete "$STORAGE_DIR/$sub/" "$DEST/$sub/"
done

# Prune: keep the newest $KEEP timestamped dirs.
ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sort | head -n -"$KEEP" | while read -r old; do
  echo "[machina-backup] pruning $old"
  rm -rf "$old"
done

echo "[machina-backup] done: $(du -sh "$DEST" | cut -f1)"
