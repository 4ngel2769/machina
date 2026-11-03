// Throwaway: prove the OS picker path, including that the server enforces
// image-pickable rights rather than trusting the form.
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
  try { b = JSON.parse(t); } catch { b = { raw: t.slice(0, 90) }; }
  return { status: r.status, body: b };
}

async function main() {
  const rd = rawDb();
  const admin = rd.prepare(`select id, name, role from users where role = 'admin' limit 1`).get() as { id: string; name: string; role: string };
  const A = await sessionFor(admin);

  const plan = rd.prepare(`select id from plans where active = 1 order by vcpu asc limit 1`).get() as { id: string };
  const ready = rd.prepare(`select id, name from images where status = 'ready' order by name limit 1`).get() as { id: string; name: string };
  const alpine = rd.prepare(`select id, name, status from images where id = 'alpine-3.20'`).get() as { id: string; name: string; status: string };
  const bogus = rd.prepare(`select id from images where status = 'broken' limit 1`).get() as { id: string } | undefined;
  console.log(`ready image: ${ready.name} (${ready.id})`);
  console.log(`alpine status: ${alpine.status}`);
  if (bogus) console.log(`broken image available for the negative test: ${bogus.id}\n`);

  const mk = async (pickable: number, assigned: string | null) => {
    const n = `osp${Date.now().toString(36).slice(-5)}${pickable}`;
    await call(A, '/api/admin', { method: 'POST', body: JSON.stringify({ op: 'createUser', name: n, password: 'Os-Pick-Test1!' }) });
    const u = rd.prepare(`select id, name, role from users where name = ?`).get(n) as { id: string; name: string; role: string };
    rd.prepare(`update users set balance_cents = 500000, image_pickable = ?, assigned_image_id = ? where id = ?`).run(pickable, assigned, u.id);
    return u;
  };

  // --- account that MAY choose ---
  const picker = await mk(1, null);
  const P = await sessionFor(picker);
  const cat = await call(P, '/api/catalog');
  console.log(`catalog says imagePickable=${(cat.body as { imagePickable: number }).imagePickable}`);

  const r1 = await call(P, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'pick-ok', planId: plan.id, imageId: ready.id }) });
  console.log(`picker picks ${ready.name}      -> ${r1.status}`);
  const reqId = r1.body.id as string;
  const row1 = rd.prepare(`select image_id from instance_requests where id = ?`).get(reqId) as { image_id: string | null };
  console.log(`  stored image_id: ${row1?.image_id} ${row1?.image_id === ready.id ? '(matches choice)' : '(MISMATCH)'}`);

  const r2 = await call(P, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'pick-nope', planId: plan.id, imageId: 'does-not-exist' }) });
  console.log(`picker picks a fake image   -> ${r2.status} ${JSON.stringify(r2.body)}`);
  if (bogus) {
    const r3 = await call(P, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'pick-broken', planId: plan.id, imageId: bogus.id }) });
    console.log(`picker picks a broken image -> ${r3.status} ${JSON.stringify(r3.body)}`);
  }

  // --- account that may NOT choose ---
  const fixed = await mk(0, 'debian-12');
  const F = await sessionFor(fixed);
  const cat2 = await call(F, '/api/catalog');
  console.log(`\nfixed account: imagePickable=${(cat2.body as { imagePickable: number }).imagePickable} assigned=${(cat2.body as { assignedImageId: string }).assignedImageId}`);

  const r4 = await call(F, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'fixed-ok', planId: plan.id }) });
  console.log(`fixed account, no image sent -> ${r4.status}`);
  const row4 = rd.prepare(`select image_id from instance_requests where id = ?`).get(r4.body.id as string) as { image_id: string | null };
  console.log(`  stored image_id: ${row4?.image_id} ${row4?.image_id === 'debian-12' ? '(admin-assigned, correct)' : '(MISMATCH)'}`);

  // the important one: a user WITHOUT pick rights trying to choose anyway
  const r5 = await call(F, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'fixed-sneak', planId: plan.id, imageId: 'alpine-3.20' }) });
  const row5 = rd.prepare(`select image_id from instance_requests where id = ?`).get(r5.body.id as string) as { image_id: string | null };
  console.log(`fixed account tries to pick alpine -> ${r5.status}, stored ${row5?.image_id} ${row5?.image_id === 'debian-12' ? '(override IGNORED, correct)' : '(!! CHOICE HONOURED)'}`);

  // assigned image that is itself NOT usable: quarantine one temporarily so the
  // "admin assigned an image that cannot boot" path is actually exercised
  const wasStatus = alpine.status;
  rd.prepare(`update images set status = 'broken' where id = 'alpine-3.20'`).run();
  await call(A, `/api/admin`, { method: 'POST', body: JSON.stringify({ op: 'setUserImage', userId: fixed.id, assignedImageId: 'alpine-3.20' }) });
  const r6 = await call(F, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'fixed-badimg', planId: plan.id }) });
  console.log(`assigned image is BROKEN -> ${r6.status} ${JSON.stringify(r6.body)}`);

  // and a pickable user must not be offered the quarantined one either
  const cat3 = await call(P, '/api/catalog');
  const offered = ((cat3.body as { images: { id: string; status: string }[] }).images ?? []);
  console.log(`catalog still lists alpine as ${offered.find(i => i.id === 'alpine-3.20')?.status} (UI filters to 'ready')`);
  const r7 = await call(P, '/api/requests', { method: 'POST', body: JSON.stringify({ name: 'pick-broken2', planId: plan.id, imageId: 'alpine-3.20' }) });
  console.log(`picker picks the broken one -> ${r7.status} ${JSON.stringify(r7.body)}`);

  rd.prepare(`update images set status = ? where id = 'alpine-3.20'`).run(wasStatus);

  for (const u of [picker, fixed]) {
    rd.prepare(`delete from instance_requests where user_id = ?`).run(u.id);
    rd.prepare(`delete from users where id = ?`).run(u.id);
  }
  rd.prepare(`delete from quotas where user_id not in (select id from users)`).run();
  console.log('\ncleaned up');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });