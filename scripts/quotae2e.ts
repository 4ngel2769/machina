// Throwaway: the actual operator workflow, end to end.
//
// admin sets a quota -> customer requests -> admin approves -> a REAL VM is
// provisioned under that quota -> quota reflects the usage -> cleanup.
// This is the "give someone an account and provision it with a VM and quota"
// loop the whole thing exists for.
import { encode } from 'next-auth/jwt';
import { rawDb } from '../lib/db/index.ts';

const BASE = 'http://127.0.0.1:3999';

async function sessionFor(u: { id: string; name: string; role: string }) {
  return `authjs.session-token=${await encode({
    token: { sub: u.id, id: u.id, name: u.name, role: u.role },
    secret: process.env.AUTH_SECRET as string,
    salt: 'authjs.session-token',
    maxAge: 1800,
  })}`;
}

async function call(cookie: string, path: string, init: RequestInit = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { cookie, origin: BASE, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const t = await r.text();
  let b: Record<string, unknown>;
  try { b = JSON.parse(t); } catch { b = { raw: t.slice(0, 100) }; }
  return { status: r.status, body: b };
}

async function main() {
  const rd = rawDb();
  const admin = rd.prepare(`select id, name, role from users where role = 'admin' limit 1`).get() as { id: string; name: string; role: string };
  const A = await sessionFor(admin);
  const uname = `e2e${Date.now().toString(36).slice(-5)}`;

  await call(A, '/api/admin', { method: 'POST', body: JSON.stringify({ op: 'createUser', name: uname, password: 'Qu0ta-E2E-Pass!' }) });
  const cust = rd.prepare(`select id, name, role from users where name = ?`).get(uname) as { id: string; name: string; role: string };
  rd.prepare(`update users set balance_cents = 500000 where id = ?`).run(cust.id);
  const C = await sessionFor(cust);
  console.log(`customer account ${uname} created\n`);

  // exactly one Micro VM allowed
  const set = await call(A, `/api/quotas/${cust.id}`, { method: 'POST', body: JSON.stringify({ maxVms: 1, maxVcpus: 2, maxMemoryMb: 2048, maxDiskGb: 20 }) });
  console.log(`quota set -> ${set.status}`);

  const plan = rd.prepare(`select id, name from plans where active = 1 order by vcpu asc limit 1`).get() as { id: string; name: string };
  const req = await call(C, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'e2e-vm', planId: plan.id }) });
  const reqId = req.body.id as string;
  console.log(`customer requested a ${plan.name} -> ${req.status} (${reqId})`);

  const appr = await call(A, `/api/requests/${reqId}`, { method: 'POST', body: JSON.stringify({ op: 'approve' }) });
  const instId = appr.body.instanceId as string;
  console.log(`admin approved -> ${appr.status} instance ${instId}`);
  if (!instId) { console.log(JSON.stringify(appr.body)); process.exit(1); }

  // watch it come up for real
  console.log('\nprovisioning:');
  let status = '';
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const row = rd.prepare(`select status, ip from instances where id = ?`).get(instId) as { status: string; ip: string };
    if (row.status !== status) { status = row.status; console.log(`  ${new Date().toISOString().slice(11, 19)}  ${status}`); }
    if (status === 'running') break;
    if (status === 'error') {
      const j = rd.prepare(`select error from jobs where instance_id = ? order by created_at desc limit 1`).get(instId) as { error: string };
      console.log('  FAILED:', j?.error);
      break;
    }
  }

  const q = await call(C, '/api/quota');
  console.log(`\ncustomer quota view: usage=${JSON.stringify(q.body.usage)} pct.vms=${(q.body.pct as Record<string, number>).vms}%`);
  const over = await call(C, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'e2e-vm2', planId: plan.id }) });
  console.log(`second request while at quota -> ${over.status} ${JSON.stringify(over.body)}`);

  // teardown
  await call(A, `/api/instances/${instId}`, { method: 'POST', body: JSON.stringify({ action: 'delete' }) });
  console.log('\ndeleting instance...');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if (!rd.prepare(`select 1 from instances where id = ?`).get(instId)) break;
  }
  rd.prepare(`delete from users where id = ?`).run(cust.id);
  rd.prepare(`delete from quotas where user_id = ?`).run(cust.id);
  rd.prepare(`delete from instance_requests where user_id = ?`).run(cust.id);
  console.log('cleaned up; instances left:', rd.prepare(`select count(*) c from instances`).get());
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });