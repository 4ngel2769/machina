import { getDb, rawDb } from '.';
import { plans, images, users } from './schema';
import { config } from '@/lib/config';
import { hashPassword, newId, randToken } from '@/lib/core/crypto';
import { macFromId } from '@/lib/core/driver';

/**
 * One-time repair for the macFromId collision bug: every instance id has the
 * same length, so the old hash returned one MAC for all of them. Any instance
 * that is NOT currently running gets a freshly derived unique MAC; running
 * instances keep theirs so their live domain is not disturbed.
 */
function repairDuplicateMacs(): void {
  const rd = rawDb();
  const rows = rd.prepare(`select id, mac, status from instances`).all() as
    { id: string; mac: string; status: string }[];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.status === 'running') { seen.add(r.mac); continue; }
    const fresh = macFromId(r.id);
    let mac = fresh;
    let bump = 0;
    while (seen.has(mac)) {
      bump++;
      mac = fresh.replace(/(..)$/, (m) => ((parseInt(m, 16) + bump) & 0xff).toString(16).padStart(2, '0'));
    }
    seen.add(mac);
    if (mac !== r.mac) {
      rd.prepare(`update instances set mac=? where id=?`).run(mac, r.id);
      console.log(`[seed] repaired duplicate MAC for ${r.id}: ${r.mac} -> ${mac}`);
    }
  }
}

/**
 * One-time seed of baseline rows. Called at server boot even if migrations
 * already ran, so a fresh install trivially gets plans and the admin user.
 */
export async function runSeed(): Promise<void> {
  const db = rawDb();
  clearSeedOnce();
  repairDuplicateMacs();
  // plans (insert-only: admin edits via setPlan must survive restarts)
  const seedPlans: Array<{ id: string; name: string; vcpu: number; ram_mb: number; disk_gb: number; hourly: number; bwGb: number }> = [
    { id: 'nano',    name: 'Nano',    vcpu: 1, ram_mb: 512,   disk_gb: 5,  hourly: 0.15, bwGb: 50 },
    { id: 'micro',   name: 'Micro',   vcpu: 1, ram_mb: 1024,  disk_gb: 10, hourly: 0.30, bwGb: 100 },
    { id: 'small',   name: 'Small',   vcpu: 2, ram_mb: 2048,  disk_gb: 20, hourly: 0.60, bwGb: 250 },
    { id: 'medium',  name: 'Medium',  vcpu: 2, ram_mb: 4096,  disk_gb: 40, hourly: 1.20, bwGb: 500 },
    { id: 'large',   name: 'Large',   vcpu: 4, ram_mb: 8192,  disk_gb: 80, hourly: 2.40, bwGb: 1000 },
  ];
  const reg = db.prepare(`insert into plans (id,name,vcpu,ram_mb,disk_gb,hourly_rate_cents,monthly_cap_min,bandwidth_gb,active)
    values (?,?,?,?,?,?,720,?,1)
    on conflict(id) do nothing`);
  for (const p of seedPlans) reg.run(p.id, p.name, p.vcpu, p.ram_mb, p.disk_gb, Math.round(p.hourly * 100), p.bwGb);

  // admin user — insert-only so credential changes survive restarts.
  // Rotation path: set ADMIN_FORCE_RESET=1 in machina.env alongside ADMIN_PASSWORD once.
  const adminName = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || '';
  if (adminPass) {
    const exists = db.prepare('select 1 from users where name=?').get(adminName);
    if (!exists || process.env.ADMIN_FORCE_RESET === '1') {
      db.prepare(`insert or replace into users (id,name,role,password_hash,balance_cents,created_at)
        values (?,?,'admin',?,?,?)`).run(
        newId('usr_'), adminName, hashPassword(adminPass), config.limits.defaultBalanceCents, Date.now());
    }
  }

  // image catalog (catalog rows; status='missing' until synced)
  const catalog: Array<{ id: string; name: string; distro: string; version: string; url: string; sha256_url: string }> = [
    {
      id: 'ubuntu-24.04', name: 'Ubuntu 24.04 LTS (Noble)', distro: 'ubuntu', version: '24.04',
      url: 'https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img',
      sha256_url: 'https://cloud-images.ubuntu.com/releases/24.04/release/SHA256SUMS',
    },
    {
      id: 'ubuntu-26.04', name: 'Ubuntu 26.04 LTS (Resolute)', distro: 'ubuntu', version: '26.04',
      url: 'https://cloud-images.ubuntu.com/releases/26.04/release/ubuntu-26.04-server-cloudimg-amd64.img',
      sha256_url: 'https://cloud-images.ubuntu.com/releases/26.04/release/SHA256SUMS',
    },
    {
      id: 'debian-12', name: 'Debian 12 (Bookworm)', distro: 'debian', version: '12',
      url: 'https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2',
      sha256_url: '',
    },
    {
      id: 'alpine-3.20', name: 'Alpine Linux 3.20', distro: 'alpine', version: '3.20',
      // NOTE: must be the BIOS (non-uefi) build. Guests here are defined with
      // SeaBIOS and no OVMF, and the uefi-cloudinit variant has an all-zero MBR
      // (no bootloader), so it sits at "starting domain" forever and dies on the
      // SSH timeout with a 0-byte serial log.
      url: 'https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/cloud/nocloud_alpine-3.20.0-x86_64-bios-cloudinit-r0.qcow2',
      sha256_url: '',
    },
    {
      id: 'arch-latest', name: 'Arch Linux (latest)', distro: 'arch', version: 'latest',
      url: 'https://geo.mirror.pkgbuild.com/images/latest/Arch-Linux-x86_64-cloudimg.qcow2',
      sha256_url: '',
    },
    {
      id: 'rocky-9', name: 'Rocky Linux 9', distro: 'rocky', version: '9',
      url: 'https://download.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud.latest.x86_64.qcow2',
      sha256_url: '',
    },
  ];
  const imgReg = db.prepare(`insert into images (id,name,distro,version,url,sha256,sha256_url,path,status,size_bytes,updated_at)
    values (?,?,?,?,?,?,?,'','missing',0,0)
    on conflict(id) do nothing`);
  for (const c of catalog) imgReg.run(c.id, c.name, c.distro, c.version, c.url, '', c.sha256_url);

  void getDb;
}

/** Run once per process. Empty for now — reserved for a "seed flag" if the
 *  seed ever grows side effects (e.g. admin password rotation alerts). */
function clearSeedOnce(): void { /* idempotent by design */ }
