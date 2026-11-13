/**
 * Per-user checks for the non-VM resources: ISO uploads and tenant
 * containers. These are not plans, so they do not go through checkQuota()'s
 * plan-shaped path — each gets its own verdict against the matching quota
 * columns. NULL = unlimited, 0 = none, same rule as the VM bounds.
 */

import { rawDb } from '@/lib/db';
import { getQuota, getUsage, type Verdict } from '@/lib/core/quota';
import { isoLimits } from '@/lib/host/iso-limits';

const deny = (reason: string): Verdict => ({ allowed: false, reason });

/** The per-user tier: count, total GB, per-file GB — all nullable bounds. */
function checkTier(quotaRow: ReturnType<typeof getQuota>, usage: ReturnType<typeof getUsage>, incomingBytes: number, counted: number, countedGb: number): Verdict {
  const limits = isoLimits();
  if (incomingBytes > limits.maxIsoGb * 1024 ** 3) {
    return deny(`iso exceeds the ${limits.maxIsoGb} GB upload cap`);
  }
  if (quotaRow.maxIsoCount !== null && usage.isos + counted > quotaRow.maxIsoCount) {
    return deny(`iso limit reached: you hold ${usage.isos} of ${quotaRow.maxIsoCount}. Delete one first or ask an admin to raise your quota.`);
  }
  const perUserGb = quotaRow.maxIsoTotalGb;
  const effectiveTotalGb = perUserGb === null ? limits.maxIsoTotalGb : Math.min(perUserGb, limits.maxIsoTotalGb);
  if (usage.isoGb + countedGb > effectiveTotalGb) {
    return deny(`iso storage limit reached: ${usage.isoGb.toFixed(1)} of ${effectiveTotalGb} GB used. Delete one first or ask an admin to raise your quota.`);
  }
  return { allowed: true };
}

/** The shared library ceiling, checked against every tenant's uploads. */
function checkLibraryGlobal(incomingBytes: number, alreadyRegistered: boolean): Verdict {
  const limits = isoLimits();
  const global = rawDb().prepare(`select coalesce(sum(size_bytes),0) as b from iso_uploads`).get() as { b: number };
  const incoming = alreadyRegistered ? 0 : incomingBytes;
  if (global.b + incoming > limits.maxIsoTotalGb * 1024 ** 3) {
    return deny(`the iso library is at its ${limits.maxIsoTotalGb} GB cap — delete one first`);
  }
  return { allowed: true };
}

/** Can this user upload one more ISO of `incomingBytes`?
 *  Per-user tier first, then the global library caps — both must pass.
 *  `alreadyRegistered` is for the post-upload re-check: the iso_uploads row
 *  exists by then, so count/size must not be incremented again. */
export function checkIsoUpload(userId: string, incomingBytes: number, opts?: { alreadyRegistered?: boolean }): Verdict {
  const quotaRow = getQuota(userId);
  if (quotaRow.suspended) return deny('your account is suspended — contact an admin');
  const usage = getUsage(userId);
  const registered = !!opts?.alreadyRegistered;
  const counted = registered ? 0 : 1;
  const countedGb = registered ? 0 : incomingBytes / 1024 ** 3;
  const tier = checkTier(quotaRow, usage, incomingBytes, counted, countedGb);
  if (!tier.allowed) return tier;
  return checkLibraryGlobal(incomingBytes, registered);
}

/** Can this user create one more container of `spec`? */
export function checkContainerQuota(
  userId: string,
  spec: { memoryMb: number; cpus: number },
): Verdict {
  const quotaRow = getQuota(userId);
  if (quotaRow.suspended) return deny('your account is suspended — contact an admin');
  const usage = getUsage(userId);

  if (quotaRow.maxContainers !== null && usage.containers + 1 > quotaRow.maxContainers) {
    return deny(`container limit reached: you have ${usage.containers} of ${quotaRow.maxContainers}. Remove one first or ask an admin to raise your quota.`);
  }
  if (quotaRow.maxContainerMemMb !== null && usage.containerMemMb + spec.memoryMb > quotaRow.maxContainerMemMb) {
    return deny(`container memory limit reached: this needs ${spec.memoryMb} MB more and you have ${usage.containerMemMb} of ${quotaRow.maxContainerMemMb} MB committed.`);
  }
  if (quotaRow.maxContainerCpus !== null && usage.containerCpus + spec.cpus > quotaRow.maxContainerCpus) {
    return deny(`container cpu limit reached: this needs ${spec.cpus} more and you have ${usage.containerCpus} of ${quotaRow.maxContainerCpus} committed.`);
  }
  return { allowed: true };
}
