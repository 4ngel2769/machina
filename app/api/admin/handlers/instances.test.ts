/**
 * The admin preset-create handler must use the same provisioning funnel as
 * request approval. The inline insert it replaced skipped quota, balance,
 * host-capacity checks and per-tenant networking.
 */

import { describe, expect, test, mock } from 'bun:test';

type ProvisionArgs = {
  userId: string; name: string; planId: string;
  imageId?: string; actorName?: string; actorRole?: string;
};

const provision = mock(async (_args: ProvisionArgs) => ({ id: 'inst_created', name: 'vm-one', ip: '100.64.0.2' }));
const audit = mock(async () => {});
const targetUser = { id: 'user-1', name: 'angel', assignedImageId: 'debian-12' as string | null };

const db = {
  select: () => ({ from: () => ({ where: async () => [targetUser] }) }),
  raw: () => ({
    prepare: () => ({
      get: () => undefined,
      all: () => [],
      run: () => ({ changes: 1 }),
    }),
  }),
};

mock.module('@/lib/core/provision', () => ({ provisionInstance: provision }));
mock.module('@/lib/services/audit', () => ({ logAudit: audit }));
mock.module('@/lib/db', () => ({ getDb: () => db, rawDb: () => db.raw() }));

const { createInstance } = await import('./instances');
const admin = { id: 'admin-1', name: 'admin', role: 'admin' };

describe('admin createInstance', () => {
  test('delegates to the shared funnel with the admin role', async () => {
    provision.mockClear();
    const res = await createInstance({ targetUserId: 'user-1', name: 'vm-one', planId: 'small' }, { admin });
    expect(res.status).toBe(201);
    expect(provision).toHaveBeenCalledTimes(1);
    expect(provision.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-1', name: 'vm-one', planId: 'small', actorRole: 'admin',
    });
  });

  test('uses the account assigned image when none was requested', async () => {
    provision.mockClear();
    targetUser.assignedImageId = 'debian-12';
    await createInstance({ targetUserId: 'user-1', name: 'vm-two' }, { admin });
    expect(provision.mock.calls[0]?.[0]).toMatchObject({ planId: 'micro', imageId: 'debian-12' });
  });

  test('omits the image when the account has none', async () => {
    provision.mockClear();
    targetUser.assignedImageId = null;
    await createInstance({ targetUserId: 'user-1', name: 'vm-three' }, { admin });
    expect('imageId' in (provision.mock.calls[0]?.[0] ?? {})).toBe(false);
  });

  test('refuses an invalid name without provisioning', async () => {
    provision.mockClear();
    const res = await createInstance({ targetUserId: 'user-1', name: 'Bad_Name' }, { admin });
    expect(res.status).toBe(400);
    expect(provision).not.toHaveBeenCalled();
  });
});
