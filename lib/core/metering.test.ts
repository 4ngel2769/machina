/**
 * Monthly usage must be read once per settlement, not once per instance. The
 * cap check runs on every billing poll, so a per-row query scaled with the
 * number of VMs a user owns.
 */

import { describe, expect, test, mock } from 'bun:test';

type Call = { sql: string; args: unknown[] };
const calls: Call[] = [];

mock.module('@/lib/db', () => ({
  rawDb: () => ({
    prepare: (sql: string) => ({
      all: (...args: unknown[]) => {
        calls.push({ sql, args });
        return [
          { inst: 'inst-a', h: 3 },
          { inst: 'inst-b', h: 0 },
        ];
      },
    }),
  }),
  getDb: () => ({ select: () => ({ from: () => ({ where: async () => [] }) }) }),
}));
mock.module('@/lib/config', () => ({
  config: { meters: { sampleIntervalMin: 15 }, domainPrefix: 'machina-', storageDir: '/tmp' },
  storagePaths: () => ({ root: '/tmp', vms: '/tmp/vms' }),
}));
mock.module('@/lib/core/log', () => ({ logInfo: () => {}, logWarn: () => {}, logError: () => {} }));

const { monthlyHoursByInstance } = await import('./metering');

describe('monthlyHoursByInstance', () => {
  test('skips the query when there are no instances', () => {
    calls.length = 0;
    expect(monthlyHoursByInstance([], 100).size).toBe(0);
    expect(calls.length).toBe(0);
  });

  test('reads every instance in one grouped query', () => {
    calls.length = 0;
    const hours = monthlyHoursByInstance(['inst-a', 'inst-b'], 1000);

    expect(calls.length).toBe(1);
    expect(calls[0]?.args).toEqual(['inst-a', 'inst-b', 1000]);
    expect(calls[0]?.sql).toContain('group by instance_id');
    expect(hours.get('inst-a')).toBe(3);
    expect(hours.get('inst-b')).toBe(0);
    expect(hours.has('inst-c')).toBe(false);
  });
});
