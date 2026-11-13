/**
 * Custom (non-preset) VM specs.
 *
 * The schema's unit of size is the PLAN, not the instance: instances carry only
 * plan_id, quotas sum plan vcpu/ram/disk, and the domain XML + qcow2 overlay are
 * sized from a plan snapshot taken at create time. So a hand-built VM is a plan
 * row that exists for one box, marked custom=1 so it never shows up in the
 * catalog or the request form. Inventing a second sizing path (per-instance
 * columns) would mean every consumer of a size — quota, resize, disk creation,
 * billing — has to know about both, and that is how sizes drift.
 */

import { eq } from 'drizzle-orm';
import { getDb, rawDb } from '@/lib/db';
import { plans } from '@/lib/db/schema';
import type { Plan } from '@/lib/db/schema';
import { newId } from '@/lib/core/crypto';
import { config } from '@/lib/config';

export type CustomSpec = {
  vcpu: number;
  ramMb: number;
  diskGb: number;
  /** Monthly transfer allowance, GB. 0 = unlimited. */
  bandwidthGb: number;
  /** Billing cap per month, minutes. */
  monthlyCapMin: number;
  /** Override the computed rate. Cents per hour. */
  hourlyRateCents?: number;
};

const INT = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) ? n : null;
};

/** Cents per hour for a spec, from config.limits.customRate. */
export function customRateCents(s: { vcpu: number; ramMb: number; diskGb: number }): number {
  const c = config.limits.customRate;
  const total =
    s.vcpu * c.perVcpuHourCents +
    (s.ramMb / 1024) * c.perGbRamHourCents +
    s.diskGb * c.perGbDiskHourCents;
  // Never free: a zero rate means metering takes nothing and auto-suspend can
  // never fire, which is a different bug wearing a price tag.
  return Math.max(1, Math.round(total));
}

/** Whole number inside a range, or the message naming the bound that failed. */
function boundedInt(v: unknown, min: number, max: number, message: string): number {
  const n = INT(v);
  if (n === null || n < min || n > max) throw new Error(message);
  return n;
}

/** Blank means unlimited (0), which is the schema's meaning for instances. */
function bandwidthOf(v: unknown): number {
  const raw = v === '' || v === undefined ? 0 : Number(v);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100_000) {
    throw new Error('bandwidth must be 0 (unlimited) or GB/month up to 100000');
  }
  return Math.round(raw * 100) / 100;
}

function monthlyCapOf(v: unknown): number {
  const raw = v === '' || v === undefined ? 720 : INT(v);
  if (raw === null || raw < 1 || raw > 44_640) throw new Error('monthly cap must be 1-44640 minutes');
  return raw;
}

/** Optional per-box rate override; absent means "use the formula". */
function hourlyRateOf(v: unknown): number | undefined {
  if (v === undefined || v === '') return undefined;
  const rate = INT(v);
  if (rate === null || rate < 0 || rate > 100_000) {
    throw new Error('rate must be a whole number of cents/hour (0-100000)');
  }
  return rate;
}

/**
 * Validate a spec from a request body. Returns the normalised spec or throws an
 * Error whose message is safe to show an admin (it names the bound that failed).
 */
export function validateCustomSpec(body: Record<string, unknown>): CustomSpec {
  const diskMin = config.limits.minDiskGb;
  const diskMax = config.limits.maxDiskGb;
  return {
    vcpu: boundedInt(body.vcpu, 1, 16, 'vcpu must be a whole number from 1 to 16'),
    ramMb: boundedInt(body.ramMb, 128, 32768, 'ram must be 128-32768 MB'),
    diskGb: boundedInt(body.diskGb, diskMin, diskMax, `disk must be ${diskMin}-${diskMax} GB`),
    bandwidthGb: bandwidthOf(body.bandwidthGb),
    monthlyCapMin: monthlyCapOf(body.monthlyCapMin),
    hourlyRateCents: hourlyRateOf(body.hourlyRateCents),
  };
}

export function specLabel(s: { vcpu: number; ramMb: number; diskGb: number }): string {
  const ram = s.ramMb >= 1024 && s.ramMb % 1024 === 0 ? `${s.ramMb / 1024} GB` : `${s.ramMb} MB`;
  return `${s.vcpu} vCPU / ${ram} / ${s.diskGb} GB`;
}

/** Insert the plan row for a spec. Does NOT provision anything. */
export async function createCustomPlan(spec: CustomSpec): Promise<Plan> {
  const id = `custom-${newId().slice(0, 8)}`;
  const rate = spec.hourlyRateCents ?? customRateCents(spec);
  await getDb().insert(plans).values({
    id,
    name: `custom ${specLabel(spec)}`,
    vcpu: spec.vcpu,
    ramMb: spec.ramMb,
    diskGb: spec.diskGb,
    hourlyRateCents: rate,
    monthlyCapMin: spec.monthlyCapMin,
    bandwidthGb: spec.bandwidthGb,
    custom: 1,
    active: 1,
  });
  const [row] = await getDb().select().from(plans).where(eq(plans.id, id));
  return row;
}

/** Drop a custom plan. Never touches a catalog tier. */
export async function deleteCustomPlan(id: string): Promise<void> {
  rawDb().prepare(`delete from plans where id=? and custom=1`).run(id);
}
