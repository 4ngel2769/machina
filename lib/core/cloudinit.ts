/**
 * Cloud-init user-data, meta-data and network-config for a seed ISO.
 */
export const CLOUD_INIT_HEADER = '#cloud-config';
import fs from 'fs';
import path from 'path';
import { storagePaths } from '@/lib/config';
import { geniso } from './driver';


export interface SeedOpts {
  instanceId: string;
  hostname: string;
  rootPassword: string;
  sshPublicKeys: string[];
  mac: string;
  ip: string;
  gateway: string;
  netmask: string;
  dns: string[];
}

/** Identity, credentials and the sshd drop-in: the static half of user-data. */
function userDataHead(opts: SeedOpts): string {
  return `${CLOUD_INIT_HEADER}
hostname: ${opts.hostname}
manage_etc_hosts: true
disable_root: false
ssh_pwauth: true
users:
  - name: root
    lock_passwd: false
    ssh_authorized_keys: []
chpasswd:
  expire: false
  users:
    - name: root
      password: ${opts.rootPassword}
      type: text
growpart:
  mode: auto
  devices: ['/']
resize_rootfs: true
package_update: true
write_files:
  - path: /etc/ssh/sshd_config.d/95-machina.conf
    content: |
      PermitRootLogin yes
      PasswordAuthentication yes
`;
}

/**
 * First-boot commands. Each one exists because a real image booted without it:
 * host keys, the sshd drop-in for OpenRC, the service enable, and the iproute2
 * address fallback for images that ignore cloud-init's netplan syntax.
 */
function runcmdBlock(opts: SeedOpts): string {
  return `runcmd:
  # The cloud images ship WITHOUT /etc/ssh/ssh_host_* keys, and ssh.service is
  # gated on 'ExecStartPre=/usr/sbin/sshd -t', which aborts with "no hostkeys
  # available". sshd never comes up, the guest still boots to a login prompt,
  # and provisioning times out on SSH. 'ssh-keygen -A' only creates the keys
  # that are missing, so it is safe on every boot.
  - [sh, -c, "command -v ssh-keygen >/dev/null && ssh-keygen -A >/dev/null 2>&1 || true"]
  # Alpine is OpenRC and has no sshd_config.d Include, so the directives have to
  # be appended to the main config before the service starts.
  - [sh, -c, "grep -q 'machina-managed' /etc/ssh/sshd_config 2>/dev/null || printf '\\n# machina-managed\\nPermitRootLogin yes\\nPasswordAuthentication yes\\n' >> /etc/ssh/sshd_config 2>/dev/null || true"]
  - [sh, -c, "command -v systemctl >/dev/null && (systemctl enable ssh 2>/dev/null; systemctl restart ssh 2>/dev/null || systemctl start ssh 2>/dev/null) || true"]
  - [sh, -c, "command -v rc-service >/dev/null && (rc-update add sshd default 2>/dev/null; rc-service sshd restart 2>/dev/null; rc-service sshd start 2>/dev/null) || true"]
  # Portability net step. cloud-init's network-config v2 is netplan syntax, which
  # Debian/Ubuntu apply but Alpine/OpenRC and some minimal images ignore — the
  # guest then boots with no address and provisioning times out on SSH. Applying
  # the address directly with iproute2 works on every image and cannot hurt.
  - [sh, -c, "IFACE=$(ip -o link show | awk -F': ' '{print $2}' | grep -E '^(en|eth)' | head -1); [ -z \\"$IFACE\\" ] && exit 0; ip link set \\"$IFACE\\" up; ip addr add ${opts.ip}/${maskBits(opts.netmask)} dev \\"$IFACE\\" 2>/dev/null || true; ip route replace default via ${opts.gateway} dev \\"$IFACE\\" 2>/dev/null || true; printf 'nameserver ${opts.dns[0]}\\n' > /etc/resolv.conf 2>/dev/null || true"]`;
}

function authorizedKeys(keys: string[]): string {
  if (!keys.length) return '';
  return `ssh_authorized_keys:\n${keys.map((keyLine) => `  - ${keyLine}`).join('\n')}`;
}

/** Files written into the per-instance seed dir, then packed with genisoimage. */
export function userData(opts: SeedOpts): string {
  return `${userDataHead(opts)}${runcmdBlock(opts)}\n${authorizedKeys(opts.sshPublicKeys)}`;
}

export function metaData(opts: { instanceId: string; hostname: string }): string {
  return `instance-id: ${opts.instanceId}
local-hostname: ${opts.hostname}`;
}

export function networkConfig(opts: { mac: string; ip: string; gateway: string; netmask: string; dns: string[] }): string {
  return `version: 2
ethernets:
  machina:
    match:
      macaddress: "${opts.mac}"
    addresses:
      - ${opts.ip}/${maskBits(opts.netmask)}
    routes:
      - to: default
        via: ${opts.gateway}
    nameservers:
      addresses: [${opts.dns.join(', ')}]
`;
}

function maskBits(netmask: string): number {
  return netmask.split('.').reduce((bits, octet) => {
    const bitsSet = parseInt(octet, 10).toString(2).padStart(8, '0');
    return bits + (bitsSet.match(/1/g)?.length ?? 0);
  }, 0);
}

/**
 * Build the cloud-init seed ISO for an instance. Layout:
 *   <seeds>/<instanceId>/{user-data, meta-data, network-config} -> seed.iso
 * Returns the absolute ISO path. Non-fatal failures throw — provisioning
 * cannot proceed without a seed.
 */
export async function buildSeed(
  opts: SeedOpts & { seedIsoPath: string },
): Promise<void> {
  const sp = storagePaths();
  const dir = path.join(sp.seeds, opts.instanceId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/user-data`, userData(opts), { mode: 0o600 });
  fs.writeFileSync(`${dir}/meta-data`, metaData({ instanceId: opts.instanceId, hostname: opts.hostname }));
  fs.writeFileSync(`${dir}/network-config`,    networkConfig({ mac: opts.mac, ip: opts.ip, gateway: opts.gateway, netmask: opts.netmask, dns: opts.dns }),
  );
  // genisoimage cannot overwrite an existing ISO, and libvirt/qemu chowns the
  // one it mounted — a leftover seed.iso makes every retry fail with
  // "Permission denied". Clear it first, idempotently.
  fs.rmSync(opts.seedIsoPath, { force: true });
  await geniso(opts.seedIsoPath, dir);
}

export function seedDir(instanceId: string): string {
  return path.join(storagePaths().seeds, instanceId);
}
