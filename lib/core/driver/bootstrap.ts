/**
 * First-boot bootstrap: the storage dirs, the two dir-type pools and the NAT
 * network. Idempotent and safe to call on every start; a failure degrades to a
 * logged warning rather than taking the process down.
 */
import fs from 'fs/promises';
import { mkdirSync, existsSync } from 'fs';
import { storagePaths, config } from '@/lib/config';
import { virsh, runBinary } from './exec';
import { ignore } from '@/lib/core/ignore';

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
  for (const dirPath of [sp.root, sp.images, sp.vms, sp.seeds, sp.vnc, sp.tmp, sp.ssh, sp.serial]) {
    if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
  }
  await runBinary('chmod', ['1777', sp.vnc]).catch(ignore('dir may already be permissive'));

  // Pools: two dir-type pools over the layout dirs.
  for (const [poolName, poolDir] of [
    [config.imagePool, sp.images],
    [config.vmsPool, sp.vms],
  ] as const) {
    try {
      if (!(await poolExists(poolName))) await poolDefineDir(poolName, poolDir);
      await virsh(['pool-start', poolName]).catch(ignore('pool may already be active'));
    } catch (poolError) {
      console.log(`[driver] pool ${poolName} ensure failed (non-fatal): ${(poolError as Error).message}`);
    }
  }

  // NAT network: gateway .1 (libvirtd dnsmasq), one /24.
  try {
    if (!(await netExists(config.network))) {
      const xml = `<network><name>${config.network}</name><forward mode='nat'><nat><port start='1024' end='65535'/></nat></forward><bridge name='${config.bridgeName}' stp='on' delay='0'/><ip address='${config.gateway}' netmask='255.255.255.0'><dhcp><range start='${config.ipRange.split('-')[0].trim()}' end='${config.ipRange.split('-')[1].trim()}'/></dhcp></ip></network>`;
      const netXmlPath = `${sp.tmp}/net-${Date.now()}.xml`;
      await fs.writeFile(netXmlPath, xml);
      try {
        await virsh(['net-define', netXmlPath]);
      } finally {
        await fs.rm(netXmlPath, { force: true }).catch(ignore('temp XML may not exist'));
      }
    }
    await virsh(['net-start', config.network]).catch(ignore('net may already be active'));
  } catch (netError) {
    console.log(`[driver] network ${config.network} ensure failed (non-fatal): ${(netError as Error).message}`);
  }
}

/** Idempotent; safe on every boot; errors degrade to log warnings. */
export async function ensureSetupSafe(): Promise<void> {
  try {
    await ensureSetup();
  } catch (setupError) {
    console.log('[driver] ensureSetup failed (continuing degraded):', (setupError as Error).message);
  }
}
