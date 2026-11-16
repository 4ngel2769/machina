import { encode } from 'next-auth/jwt';
import { rawDb } from '../lib/db/index.ts';
async function main() {
  const BASE = 'http://127.0.0.1:3999';
  async function sessionFor(u: any) {
    return `authjs.session-token=${await encode({ token: { sub: u.id, id: u.id, name: u.name, role: u.role }, secret: process.env.AUTH_SECRET as string, salt: 'authjs.session-token', maxAge: 900 })}`;
  }
  async function call(cookie: string, path: string, init: RequestInit = {}) {
    const r = await fetch(BASE + path, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json', ...(init.headers ?? {}) } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
  const rd = rawDb();
  const admin = rd.prepare(`select id, name, role from users where role='admin' limit 1`).get() as any;
  const A = await sessionFor(admin);
  const n = `repick${Date.now().toString(36).slice(-5)}`;
  await call(A, '/api/admin', { method: 'POST', body: JSON.stringify({ op: 'createUser', name: n, password: 'Repick-Test1!' }) });
  const u = rd.prepare(`select id, name, role from users where name=?`).get(n) as any;
  const U = await sessionFor(u);
  console.log('pick1:', JSON.stringify((await call(U, '/api/net', { method: 'POST', body: JSON.stringify({ v4: '100.88.9.0/24' }) })).body));
  console.log('repick same:', JSON.stringify(await call(U, '/api/net', { method: 'POST', body: JSON.stringify({ v4: '100.88.9.0/24' }) })));
  console.log('v6 only (auto v4 must not self-collide):', JSON.stringify(await call(U, '/api/net', { method: 'POST', body: JSON.stringify({ v6: 'fd7a:115c:a1e0:88::/64' }) })));
  rd.prepare(`delete from user_nets where user_id=?`).run(u.id);
  rd.prepare(`delete from users where id=?`).run(u.id);
  rd.prepare(`delete from quotas where user_id not in (select id from users)`).run();
  console.log('cleaned');

}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
