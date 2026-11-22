/**
 * The per-user lock that keeps a quota check and its insert atomic. Provision
 * and container creation both depend on a failed call leaving the queue usable.
 */

import { describe, expect, test } from 'bun:test';
import { withKeyLock } from './mutex';

type Release = () => void;
function gate(): { wait: Promise<void>; release: Release } {
  let release!: Release;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

describe('withKeyLock', () => {
  test('serializes calls that share a key', async () => {
    const firstGate = gate();
    const order: string[] = [];
    const first = withKeyLock('vm:u1', async () => {
      order.push('first:start');
      await firstGate.wait;
      order.push('first:end');
      return 1;
    });
    const second = withKeyLock('vm:u1', async () => {
      order.push('second:start');
      return 2;
    });

    firstGate.release();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });
});

describe('withKeyLock across keys', () => {
  test('does not serialize different keys', async () => {
    const gateA = gate();
    const gateB = gate();
    const entered: string[] = [];
    const first = withKeyLock('vm:a', async () => {
      entered.push('a');
      await gateA.wait;
    });
    const second = withKeyLock('vm:b', async () => {
      entered.push('b');
      await gateB.wait;
    });

    // The lock schedules each callback through Promise.then.
    await Promise.resolve();
    await Promise.resolve();
    expect(entered).toEqual(['a', 'b']);
    gateA.release();
    gateB.release();
    await Promise.all([first, second]);
  });
});

describe('withKeyLock failures', () => {
  test('a rejected call does not wedge later calls', async () => {
    const failed = withKeyLock('vm:u2', async () => { throw new Error('boom'); });
    const next = withKeyLock('vm:u2', async () => 'ok');

    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe('ok');
  });
});
