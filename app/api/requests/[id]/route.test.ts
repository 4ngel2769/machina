/**
 * Two admins approving one request must not both provision and bill it. The
 * claim UPDATE is the arbiter; this test drives the route with a fake request
 * row whose status changes exactly as a conditional SQL UPDATE would.
 */

import { describe, expect, test, mock } from 'bun:test';
import { NextRequest } from 'next/server';

type ReviewRow = {
  id: string; user_id: string; name: string; plan_id: string;
  image_id: string | null; status: string;
};

const row: ReviewRow = {
  id: 'req-1', user_id: 'user-1', name: 'vm-one', plan_id: 'small', image_id: null, status: 'pending',
};
const provision = mock(async (_args: { excludeRequestId?: string }) => ({ id: 'inst_1', name: 'vm-one', ip: '100.64.0.2' }));

const statement = (sql: string) => ({
  get: () => (sql.includes('from instance_requests') ? row : undefined),
  run: (...values: unknown[]) => {
    if (sql.includes("status='reviewing'")) {
      if (row.status !== 'pending') return { changes: 0 };
      row.status = 'reviewing';
      void values;
      return { changes: 1 };
    }
    if (sql.includes("status='approved'")) row.status = 'approved';
    return { changes: 1 };
  },
});

mock.module('@/lib/api', () => ({
  requireAdmin: async () => ({ user: { id: 'admin-1', name: 'admin', role: 'admin' }, response: null }),
  guardMutation: () => null,
  jsonBody: async () => ({ op: 'approve' }),
  json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
  err: (message: string, status = 400) => new Response(JSON.stringify({ error: message }), { status }),
}));
mock.module('@/lib/db', () => ({
  rawDb: () => ({ prepare: statement }),
  getDb: () => ({ select: () => ({ from: () => ({ where: async () => [{ id: 'user-1' }] }) }) }),
}));
mock.module('@/lib/core/provision', () => ({ provisionInstance: provision }));
mock.module('@/lib/services/audit', () => ({ logAudit: async () => {} }));
mock.module('@/lib/services/notify', () => ({ notify: () => {} }));

const { POST } = await import('./route');
const req = new NextRequest('http://local/api/requests/req-1', { method: 'POST' });
const ctx = { params: Promise.resolve({ id: 'req-1' }) };

describe('request approval', () => {
  test('only one of two concurrent approvals provisions', async () => {
    row.status = 'pending';
    provision.mockClear();

    const [first, second] = await Promise.all([POST(req, ctx), POST(req, ctx)]);
    const statuses = [first.status, second.status].sort();

    expect(provision).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([200, 409]);
    expect(row.status).toBe('approved');
  });
});
