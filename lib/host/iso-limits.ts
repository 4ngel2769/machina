/**
 * ISO library limits. Admin-editable through /api/isos/limits and stored in
 * the settings table; config.limits.* is the fallback so a fresh install and
 * a missing row behave identically.
 */
import { config } from '@/lib/config';
import { getSetting, setSetting } from '@/lib/core/settings';

export type IsoLimits = { maxIsoGb: number; maxIsoCount: number; maxIsoTotalGb: number };

const KEY = 'iso.limits';

export function isoLimits(): IsoLimits {
  const saved = getSetting<Partial<IsoLimits>>(KEY);
  return {
    maxIsoGb: saved?.maxIsoGb ?? config.limits.maxIsoGb,
    maxIsoCount: saved?.maxIsoCount ?? config.limits.maxIsoCount,
    maxIsoTotalGb: saved?.maxIsoTotalGb ?? config.limits.maxIsoTotalGb,
  };
}

export function saveIsoLimits(input: Partial<IsoLimits>): IsoLimits {
  const current = isoLimits();
  const next: IsoLimits = {
    maxIsoGb: positiveInt(input.maxIsoGb, current.maxIsoGb, 64),
    maxIsoCount: positiveInt(input.maxIsoCount, current.maxIsoCount, 500),
    maxIsoTotalGb: positiveInt(input.maxIsoTotalGb, current.maxIsoTotalGb, 4096),
  };
  setSetting(KEY, next);
  return next;
}

function positiveInt(value: unknown, fallback: number, ceiling: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), ceiling);
}
