// Live check for the subnet picker: user pick, validation, lock, admin pick.
import { encode } from 'next-auth/jwt';
import { rawDb } from '../lib/db/index.ts';

const BASE = 'http://127.0.0.1:3999';

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
  const t = await r.text();
  let b: Record<string, unknown>;
  try { b = JSON.parse(t); } catch { b = { raw: t.slice(0, 120) }; }
  return { status: r.status, body: b };
}

async function main() {
  const rd = rawDb();
  const admin = rd.prepare(`select id, name, role from users where role = 'admin' limit 1`).get() as { id: string; name: string; role: string };
  const A = await sessionFor(admin);

  const n = `netpick${Date.now().toString(36).slice(-6)}`;
  await call(A, '/api/admin', { method: 'POST', body: JSON.stringify({ op: 'createUser', name: n, password: 'Net-Pick-Test1!' }) });
  const u = rd.prepare(`select id, name, role from users where name = ?`).get(n) as { id: string; name: string; role: string };
  const U = await sessionFor(u);
  console.log(`test user: ${u.name}`);

  // 1. GET before any pick
  const g0 = await call(U, '/api/net');
  console.log(`GET /api/net (fresh) -> ${g0.status}`, JSON.stringify(g0.body).slice(0, 200));

  // 2. bad v4 (outside pool)
  const bad1 = await call(U, '/api/net', { method: 'POST', body: JSON.stringify({ v4: '10.1.2.0/24' }) });
  console.log(`POST v4=10.1.2.0/24 -> ${bad1.status} ${JSON.stringify(bad1.body)}`);

  // 3. bad v4 (wrong prefix)
  const bad2 = await call(U, '/api/net', { method: 'POST', body: JSON.stringify({ v4: '100.77.4.0/16' }) });
  console.log(`POST v4=100.77.4.0/16 -> ${bad2.status} ${JSON.stringify(bad2.body)}`);

  // 4. bad v6 (outside ULA)
  const bad3 = await call(U, '/api/net', { method: 'POST', body: JSON.stringify({ v6: 'fd00::/64' }) });
  console.log(`POST v6=fd00::/64 -> ${bad3.status} ${JSON.stringify(bad3.body)}`);

  // 5. good pick, v4 only (v6 auto)
  const ok1 = await call(U, '/api/net', { method: 'POST', body: JSON.stringify({ v4: '100.77.4.0/24' }) });
  console.log(`POST v4=100.77.4.0/24 -> ${ok1.status}`, JSON.stringify(ok1.body));

  // 6. duplicate v4 from a second user
  const n2 = `${n}b`;
  await call(A, '/api/admin', { method: 'POST', body: JSON.stringify({ op: 'createUser', name: n2, password: 'Net-Pick-Test1!' }) });
  const u2 = rd.prepare(`select id, name, role from users where name = ?`).get(n2) as { id: string; name: string; role: string };
  const U2 = await sessionFor(u2);
  const dup = await call(U2, '/api/net', { method: 'POST', body: JSON.stringify({ v4: '100.77.4.0/24' }) });
  console.log(`user2 same v4 -> ${dup.status} ${JSON.stringify(dup.body)}`);

  // 7. admin pick for user2 with explicit v6
  const adm = await call(A, `/api/admin/users/${u2.id}/net`, { method: 'POST', body: JSON.stringify({ v6: 'fd7a:115c:a1e0:77::/64' }) });
  console.log(`admin sets user2 v6 -> ${adm.status}`, JSON.stringify(adm.body));

  // 8. reset user2 to auto
  const rst = await call(U2, '/api/net', { method: 'POST', body: JSON.stringify({ reset: true }) });
  console.log(`user2 reset -> ${rst.status}`, JSON.stringify(rst.body));

  // cleanup
  rd.prepare(`delete from user_nets where user_id in (?, ?)`).run(u.id, u2.id);
  rd.prepare(`delete from users where id in (?, ?)`).run(u.id, u2.id);
  rd.prepare(`delete from quotas where user_id not in (select id from users)`).run();
  console.log('cleaned up');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
