/**
 * Login primitives: the throttle must be resettable after a successful
 * sign-in, and generated passwords must stay inside the bcrypt-safe alphabet.
 */

import { describe, expect, test } from 'bun:test';
import { hashPassword, verifyPassword, randPassword, rateLimit, resetRateLimit } from './crypto';

describe('credential throttle', () => {
  test('blocks after the limit, then allows again after a reset', () => {
    const key = 'crypto.test:throttle';
    resetRateLimit(key);

    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(false);

    resetRateLimit(key);
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    resetRateLimit(key);
  });
});

describe('password helpers', () => {
  test('hashes verify only the original password', () => {
    const hash = hashPassword('correct horse battery');
    expect(verifyPassword('correct horse battery', hash)).toBe(true);
    expect(verifyPassword('wrong password', hash)).toBe(false);
  });

  test('generates 16 chars from the unambiguous alphabet', () => {
    const alphabet = /^[abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/;
    for (let index = 0; index < 20; index += 1) {
      expect(randPassword()).toMatch(alphabet);
    }
  });
});
