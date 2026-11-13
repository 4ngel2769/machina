/**
 * Domain-level operations that are not config edits: removing a definition,
 * and the prefix machina's own domains carry.
 */
import { virsh } from '@/lib/core/driver';
import { config } from '@/lib/config';
import { rawDb } from '@/lib/db';
import { assertName } from './xml';

/** Undefine a domain nothing else owns. Machina VMs are deleted via instances. */
export async function undefineVm(name: string): Promise<void> {
  assertName(name);
  const owned = rawDb().prepare(`select 1 from instances where domain_name=?`).get(name);
  if (owned) throw new Error('this is a machina instance — delete it from the instances page so its disk, IP and seed are freed too');
  const state = (await virsh(['domstate', name]).catch(() => '')).trim();
  if (/running/i.test(state)) throw new Error('stop the VM before removing its definition');
  await virsh(['undefine', name]);
}

export function domainPrefix(): string {
  return config.domainPrefix;
}
