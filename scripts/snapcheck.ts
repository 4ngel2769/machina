// Throwaway end-to-end check of the snapshot API with a real session cookie.
// Mints a next-auth v5 JWT using the app AUTH_SECRET (never printed), then
// drives the actual HTTP routes so auth, ownership and guardMutation are all
// exercised rather than assumed.
import { encode } from 'next-auth/jwt';
import { rawDb } from '../lib/db/index.ts';

const BASE = 'http://127.0.0.1:3999';
const db = rawDb();

async function main() {
  const admin = db.prepare(`select id, name, role from users where role = 'admin' limit 1`).get();
  const owner = db.prepare(
    `select id, name, role from users where role = 'user' and exists (select 1 from instances i where i.user_id = users.id) limit 1`,
  ).get();
  if (!admin) throw new Error('no admin user in db');

  const cookie = async (u) => {
    const jwt = await encode({
      token: { sub: u.id, id: u.id, name: u.name, role: u.role },
      secret: process.env.AUTH_SECRET,
      salt: 'authjs.session-token',
      maxAge: 3600,
    });
    return `authjs.session-token=${jwt}`;
  };

  const inst = db.prepare(`select id, name, user_id, domain_name from instances order by created_at limit 1`).get();
  console.log(`target instance: ${inst.name} (${inst.id})`);

  const call = async (who, path, init = {}) => {
    const headers = { cookie: await cookie(who), origin: BASE, ...(init.headers ?? {}) };
    const r = await fetch(BASE + path, { ...init, headers });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    return { status: r.status, body };
  };

  // 1. GET as the owning admin
  const g = await call(admin, `/api/instances/${inst.id}/snapshots`);
  console.log(`GET  -> ${g.status}, ${Array.isArray(g.body.snapshots) ? g.body.snapshots.length : '?'} snapshots, disk=${g.body.disk ? Math.round(g.body.disk.actualBytes / 1048576) + 'MB' : 'null'}, planDiskGb=${g.body.planDiskGb}`);

  // 2. POST with a hostile name -> must be refused before it reaches libvirt
  const bad = await call(admin, `/api/instances/${inst.id}/snapshots`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', name: '../../etc/passwd' }),
  });
  console.log(`POST bad name -> ${bad.status} ${JSON.stringify(bad.body)}`);

  // 3. POST cross-origin -> guardMutation must block
  const xo = await call(admin, `/api/instances/${inst.id}/snapshots`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ action: 'create', name: 'xorigin' }),
  });
  console.log(`POST cross-origin -> ${xo.status} ${JSON.stringify(xo.body)}`);

  // 4. POST a non-owner -> must be 403
  if (owner) {
    const other = db.prepare(`select id from instances where user_id <> ? and id <> ? limit 1`).get(owner.id, inst.id);
    if (other) {
      const no = await call(owner, `/api/instances/${other.id}/snapshots`);
      console.log(`POST as non-owner -> ${no.status} ${JSON.stringify(no.body)}`);
    }
  }

  // 5. POST unknown action
  const ua = await call(admin, `/api/instances/${inst.id}/snapshots`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'nuke' }),
  });
  console.log(`POST unknown action -> ${ua.status} ${JSON.stringify(ua.body)}`);

  // 6. Real create, then revert, then delete through HTTP only
  const mk = await call(admin, `/api/instances/${inst.id}/snapshots`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', name: 'api-check', description: 'created over http' }),
  });
  console.log(`POST create -> ${mk.status} ${JSON.stringify(mk.body)}`);

  const wait = async (label) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const j = db.prepare(
        `select status, error from jobs where instance_id = ? and type like 'instance.snapshot%' order by created_at desc limit 1`,
      ).get(inst.id);
      if (j && ['done', 'failed'].includes(j.status)) {
        console.log(`  ${label}: ${j.status}${j.error ? ' — ' + j.error.split('\n')[0] : ''}`);
        return j.status === 'done';
      }
    }
    console.log(`  ${label}: TIMED OUT`);
    return false;
  };
  await wait('create job');

  const g2 = await call(admin, `/api/instances/${inst.id}/snapshots`);
  console.log('after create:', (g2.body.snapshots ?? []).map((s) => `${s.name}${s.current ? '*' : ''}`).join(', '));

  const rv = await call(admin, `/api/instances/${inst.id}/snapshots`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'revert', name: 'api-check', mode: 'live' }),
  });
  console.log(`POST revert -> ${rv.status} ${JSON.stringify(rv.body)}`);
  await wait('revert job');

  const del = await call(admin, `/api/instances/${inst.id}/snapshots`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'delete', name: 'api-check' }),
  });
  console.log(`POST delete -> ${del.status} ${JSON.stringify(del.body)}`);
  await wait('delete job');

  const g3 = await call(admin, `/api/instances/${inst.id}/snapshots`);
  console.log('final:', (g3.body.snapshots ?? []).map((s) => `${s.name}${s.orphaned ? '(orphaned)' : ''}`).join(', ') || '(none)');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
