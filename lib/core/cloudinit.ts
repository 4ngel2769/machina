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

/** Files written into the per-instance seed dir, then packed with genisoimage. */
export function userData(o: SeedOpts): string {
  const keys = o.sshPublicKeys.length
    ? `ssh_authorized_keys:\n${o.sshPublicKeys.map((k) => `  - ${k}`).join('\n')}`
    : '';
  return `${CLOUD_INIT_HEADER}
hostname: ${o.hostname}
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
      password: ${o.rootPassword}
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
runcmd:
  # systemd distros (debian/ubuntu/arch/rocky): enable + restart sshd.
  # Alpine is OpenRC, has no systemctl and no sshd_config.d Include, so it needs
  # the runlevel service and the directives appended to the main sshd_config —
  # without this Alpine boots fine and never answers SSH (provisioning timeout).
  - [sh, -c, "command -v systemctl >/dev/null && systemctl enable --now ssh 2>/dev/null || systemctl restart ssh 2>/dev/null || true"]
  - [sh, -c, "command -v rc-service >/dev/null && (rc-update add sshd default 2>/dev/null; rc-service sshd restart 2>/dev/null; rc-service sshd start 2>/dev/null) || true"]
  - [sh, -c, "grep -q 'machina-managed' /etc/ssh/sshd_config 2>/dev/null || printf '\\n# machina-managed\\nPermitRootLogin yes\\nPasswordAuthentication yes\\n' >> /etc/ssh/sshd_config 2>/dev/null || true"]
  # Portability net step. cloud-init's network-config v2 is netplan syntax, which
  # Debian/Ubuntu apply but Alpine/OpenRC and some minimal images ignore — the
  # guest then boots with no address and provisioning times out on SSH. Applying
  # the address directly with iproute2 works on every image and cannot hurt.
  - [sh, -c, "IFACE=$(ip -o link show | awk -F': ' '{print $2}' | grep -E '^(en|eth)' | head -1); [ -z \\"$IFACE\\" ] && exit 0; ip link set \\"$IFACE\\" up; ip addr add ${o.ip}/${maskBits(o.netmask)} dev \\"$IFACE\\" 2>/dev/null || true; ip route replace default via ${o.gateway} dev \\"$IFACE\\" 2>/dev/null || true; printf 'nameserver ${o.dns[0]}\\n' > /etc/resolv.conf 2>/dev/null || true"]
${keys}`;
}

export function metaData(o: { instanceId: string; hostname: string }): string {
  return `instance-id: ${o.instanceId}
local-hostname: ${o.hostname}`;
}

export function networkConfig(o: { mac: string; ip: string; gateway: string; netmask: string; dns: string[] }): string {
  return `version: 2
ethernets:
  machina:
    match:
      macaddress: "${o.mac}"
    addresses:
      - ${o.ip}/${maskBits(o.netmask)}
    routes:
      - to: default
        via: ${o.gateway}
    nameservers:
      addresses: [${o.dns.join(', ')}]
`;
}

function maskBits(netmask: string): number {
  return netmask.split('.').reduce((bits, oct) => {
    let n = parseInt(oct, 10).toString(2).padStart(8, '0');
    return bits + (n.match(/1/g)?.length ?? 0);
  }, 0);
}

/**
 * Build the cloud-init seed ISO for an instance. Layout:
 *   <seeds>/<instanceId>/{user-data, meta-data, network-config} -> seed.iso
 * Returns the absolute ISO path. Non-fatal failures throw — provisioning
 * cannot proceed without a seed.
 */
export async function buildSeed(
  o: SeedOpts & { seedIsoPath: string },
): Promise<void> {
  const sp = storagePaths();
  const dir = path.join(sp.seeds, o.instanceId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/user-data`, userData(o), { mode: 0o600 });
  fs.writeFileSync(`${dir}/meta-data`, metaData({ instanceId: o.instanceId, hostname: o.hostname }));
  fs.writeFileSync(`${dir}/network-config`,    networkConfig({ mac: o.mac, ip: o.ip, gateway: o.gateway, netmask: o.netmask, dns: o.dns }),
  );
  // genisoimage cannot overwrite an existing ISO, and libvirt/qemu chowns the
  // one it mounted — a leftover seed.iso makes every retry fail with
  // "Permission denied". Clear it first, idempotently.
  fs.rmSync(o.seedIsoPath, { force: true });
  await geniso(o.seedIsoPath, dir);
}

export function seedDir(instanceId: string): string {
  return path.join(storagePaths().seeds, instanceId);
}
