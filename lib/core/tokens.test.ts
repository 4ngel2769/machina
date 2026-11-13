/**
 * Websocket token harness: the repo's first test, and the proof that
 * `bun run test` executes. Covers the four properties the terminal and VNC
 * relays depend on: a minted token round-trips, an expired token is refused,
 * a tampered signature is refused, and a missing token is refused.
 */

import { describe, expect, test } from 'bun:test';
import { mintToken, verifyToken } from './tokens';

const INSTANCE_ID = 'inst-abc123';
const USER_ID = 'user-42';

describe('websocket tokens', () => {
  test('round-trips a minted token', () => {
    const token = mintToken(INSTANCE_ID, 'term', 120, USER_ID);
    const payload = verifyToken(token);
    expect(payload?.inst).toBe(INSTANCE_ID);
    expect(payload?.typ).toBe('term');
    expect(payload?.uid).toBe(USER_ID);
  });

  test('refuses an expired token', () => {
    const token = mintToken(INSTANCE_ID, 'vnc', -1, USER_ID);
    expect(verifyToken(token)).toBeNull();
  });

  test('refuses a tampered signature', () => {
    const token = mintToken(INSTANCE_ID, 'term', 120, USER_ID);
    const [body, signature] = token.split('.');
    const lastChar = signature.slice(-1);
    const flipped = `${signature.slice(0, -1)}${lastChar === 'A' ? 'B' : 'A'}`;
    expect(verifyToken(`${body}.${flipped}`)).toBeNull();
  });

  test('refuses a missing token', () => {
    expect(verifyToken(undefined)).toBeNull();
    expect(verifyToken(null)).toBeNull();
    expect(verifyToken('')).toBeNull();
  });
});
