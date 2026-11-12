# machina control plane, containerised.
#
# The supported deployment is still deploy/install.sh on the host (systemd),
# because a control plane that manages libvirt wants the host's own libvirt and
# docker sockets, not a namespace of its own. This image exists for the case
# where the operator would rather ship an immutable artefact than run the app
# out of a working tree, and it mounts those two sockets explicitly.
#
# It needs, at runtime:
#   /var/run/libvirt/libvirt-sock   (read/write; the libvirt group gid)
#   /var/run/docker.sock            (read/write; the docker group gid)
#   MACHINA_STORAGE_DIR             (images + overlays + seeds + vnc + serial)
#   MACHINA_DB_PATH                 (sqlite; keep it on a volume)

# syntax=docker/dockerfile:1

FROM oven/bun:1 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies first so a source edit does not re-resolve the tree.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# libvirt client (virsh), qemu-img for overlays, genisoimage for cloud-init
# seeds, docker CLI for the containers tab, tini for signal handling.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      libvirt-clients \
      qemu-utils \
      genisoimage \
      docker.io \
      tini \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app ./

# Runtime dirs so a missing bind mount is a readable error rather than ENOENT.
RUN mkdir -p /var/lib/machina/storage

EXPOSE 3999
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server.ts"]
