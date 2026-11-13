/**
 * First-boot bootstrap: the storage dirs, the two dir-type pools and the NAT
 * network. Idempotent and safe to call on every start; a failure degrades to a
 * logged warning rather than taking the process down.
 */
import fs from 'fs/promises';
import { mkdirSync, existsSync } from 'fs';
import { storagePaths, config } from '@/lib/config';
import { virsh, runBinary } from './exec';

async function poolExists(name: string): Promise<boolean> {
  try { await virsh(['pool-info', name]); return true; } catch { return false; }
}

async function poolDefineDir(name: string, dir: string): Promise<void> {
  await virsh(['pool-define-as', name, 'dir', '--target', dir]);
}

async function netExists(name: string): Promise<boolean> {
  try { await virsh(['net-info', name]); return true; } catch { return false; }
}

async function ensureSetup(): Promise<void> {
  const sp = storagePaths();
  for (const d of [sp.root, sp.images, sp.vms, sp.seeds, sp.vnc, sp.tmp, sp.ssh, sp.serial]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
  await runBinary('chmod', ['1777', sp.vnc]).catch(() => {});

  // Pools: two dir-type pools over the layout dirs.
  for (const [name, dir] of [
    [config.imagePool, sp.images],
    [config.vmsPool, sp.vms],
  ] as const) {
    try {
      if (!(await poolExists(name))) await poolDefineDir(name, dir);
      await virsh(['pool-start', name]).catch(() => {});
    } catch (e) {
      console.log(`[driver] pool ${name} ensure failed (non-fatal): ${(e as Error).message}`);
    }
  }

  // NAT network: gateway .1 (libvirtd dnsmasq), one /24.
  try {
    if (!(await netExists(config.network))) {
      const xml = `<network><name>${config.network}</name><forward mode='nat'><nat><port start='1024' end='65535'/></nat></forward><bridge name='${config.bridgeName}' stp='on' delay='0'/><ip address='${config.gateway}' netmask='255.255.255.0'><dhcp><range start='${config.ipRange.split('-')[0].trim()}' end='${config.ipRange.split('-')[1].trim()}'/></dhcp></ip></network>`;
      const tmp = `${sp.tmp}/net-${Date.now()}.xml`;
      await fs.writeFile(tmp, xml);
      try {
        await virsh(['net-define', tmp]);
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => {});
      }
    }
    await virsh(['net-start', config.network]).catch(() => {});
  } catch (e) {
    console.log(`[driver] network ${config.network} ensure failed (non-fatal): ${(e as Error).message}`);
  }
}

/** Idempotent; safe on every boot; errors degrade to log warnings. */
export async function ensureSetupSafe(): Promise<void> {
  try {
    await ensureSetup();
  } catch (e) {
    console.log('[driver] ensureSetup failed (continuing degraded):', (e as Error).message);
  }
}
