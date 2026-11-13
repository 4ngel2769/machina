#!/usr/bin/env bash
# Keep the crumberry/machina fork's maino branch in sync with upstream
# 4ngel2769/machina. Only touches refs/heads/maino on the fork; v2 and any
# other working branches are never pushed from here.
set -euo pipefail
cd /home/angel/machina

git fetch origin maino --quiet
git push crumberry-fork origin/maino:refs/heads/maino --quiet
echo "$(date -Is) synced maino -> $(git rev-parse --short origin/maino)"
