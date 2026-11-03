// Throwaway: prove per-user quota is actually enforced, end to end, over HTTP.
//
// Creates a real second customer account with a deliberately tight quota, then
// tries to blow through it as that customer. Nothing is mocked: real sessions,
// real DB rows, real quota checks.
import { encode } from 'next-auth/jwt';
import { rawDb } from '../lib/db/index.ts';

const BASE = 'http://127.0.0.1:3999';

type Quota = { maxVms: number | null; maxVcpus: number | null; maxMemoryMb: number | null; maxDiskGb: number | null; maxRunning: number | null; suspended: boolean };

async function sessionFor(u: { id: string; name: string; role: string }) {
  return `authjs.session-token=${await encode({
    token: { sub: u.id, id: u.id, name: u.name, role: u.role },
    secret: process.env.AUTH_SECRET as string,
    salt: 'authjs.session-token',
    maxAge: 900,
  })}`;
}

async function call(cookie: string, path: string, init: RequestInit = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { cookie, origin: BASE, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 120); }
  return { status: r.status, body: body as Record<string, unknown> };
}

async function main() {
  const rd = rawDb();
  const admin = rd.prepare(`select id, name, role from users where role = 'admin' limit 1`).get() as { id: string; name: string; role: string };
  const adminCookie = await sessionFor(admin);

  // A plan that fits comfortably inside the quota we are about to set.
  const plan = rd.prepare(`select id, name, vcpu, ram_mb as ramMb, disk_gb as diskGb, hourly_rate_cents as rate from plans where active = 1 order by vcpu asc limit 1`).get() as
    { id: string; name: string; vcpu: number; ramMb: number; diskGb: number; rate: number };
  console.log(`plan under test: ${plan.name} = ${plan.vcpu} vCPU / ${plan.ramMb} MB / ${plan.diskGb} GB\n`);

  // Fresh customer each run so the test is repeatable.
  const uname = `qtest${Date.now().toString(36).slice(-5)}`;
  const created = await call(adminCookie, '/api/admin', {
    method: 'POST',
    body: JSON.stringify({ op: 'createUser', name: uname, password: 'Qu0ta-Test-Pass!' }),
  });
  console.log(`create user ${uname} -> ${created.status}`);
  if (created.status >= 400) { console.log(JSON.stringify(created.body)); process.exit(1); }

  const cust = rd.prepare(`select id, name, role from users where name = ?`).get(uname) as { id: string; name: string; role: string };
  // give them credit so the BALANCE check never masks the QUOTA check
  rd.prepare(`update users set balance_cents = 500000 where id = ?`).run(cust.id);

  // Quota: exactly ONE VM. The second request must be refused.
  const set = await call(adminCookie, `/api/quotas/${cust.id}`, {
    method: 'POST',
    body: JSON.stringify({ maxVms: 1, maxVcpus: 2, maxMemoryMb: 2048, maxDiskGb: 20, suspended: false }),
  });
  console.log(`set quota -> ${set.status} ${JSON.stringify((set.body as { quota?: Quota }).quota)}\n`);

  const custCookie = await sessionFor(cust);

  const self = await call(custCookie, '/api/quota');
  console.log(`GET /api/quota as customer -> ${self.status} ${JSON.stringify(self.body)}\n`);

  // 1. first request: inside quota, must be accepted
  const r1 = await call(custCookie, '/api/requests', {
    method: 'POST',
    body: JSON.stringify({ name: 'first-vm', planId: plan.id, note: 'quota test' }),
  });
  console.log(`request #1 (within quota)   -> ${r1.status} ${JSON.stringify(r1.body)}`);

  // 2. second request: over the 1-VM limit, must be refused with a readable reason
  const r2 = await call(custCookie, '/api/requests', {
    method: 'POST',
    body: JSON.stringify({ name: 'second-vm', planId: plan.id, note: 'quota test' }),
  });
  console.log(`request #2 (over quota)    -> ${r2.status} ${JSON.stringify(r2.body)}`);

  // 3. suspended account cannot request at all
  await call(adminCookie, `/api/quotas/${cust.id}`, { method: 'POST', body: JSON.stringify({ suspended: true }) });
  const r3 = await call(custCookie, '/api/requests', {
    method: 'POST',
    body: JSON.stringify({ name: 'third-vm', planId: plan.id }),
  });
  console.log(`request #3 (suspended)     -> ${r3.status} ${JSON.stringify(r3.body)}`);

  // 4. a NON-admin cannot set someone else's quota
  const evil = await call(custCookie, `/api/quotas/${admin.id}`, {
    method: 'POST', body: JSON.stringify({ maxVms: 99 }),
  });
  console.log(`customer sets admin quota  -> ${evil.status} ${JSON.stringify(evil.body)}`);

  // 5. a customer cannot read the fleet-wide quota list
  const peek = await call(custCookie, '/api/quotas');
  console.log(`customer GET /api/quotas   -> ${peek.status} ${JSON.stringify(peek.body).slice(0, 80)}`);

  // 6. unlimited quota: a fresh account with no quota row may request freely
  const uname2 = `qfree${Date.now().toString(36).slice(-5)}`;
  await call(adminCookie, '/api/admin', { method: 'POST', body: JSON.stringify({ op: 'createUser', name: uname2, password: 'Qu0ta-Test-Pass!' }) });
  const cust2 = rd.prepare(`select id, name, role from users where name = ?`).get(uname2) as { id: string; name: string; role: string };
  rd.prepare(`update users set balance_cents = 500000 where id = ?`).run(cust2.id);
  const c2 = await sessionFor(cust2);
  const r4 = await call(c2, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'no-quota-vm', planId: plan.id }) });
  console.log(`no quota row set           -> ${r4.status} ${JSON.stringify(r4.body)}`);

  // cleanup
  rd.prepare(`delete from users where id in (?,?)`).run(cust.id, cust2.id);
  rd.prepare(`delete from quotas where user_id in (?,?)`).run(cust.id, cust2.id);
  rd.prepare(`delete from instance_requests where user_id in (?,?)`).run(cust.id, cust2.id);
  console.log('\ncleanup done');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });