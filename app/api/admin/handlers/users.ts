/** Account ops: create, password, role, delete. */

import { getDb, rawDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { grantCents } from '@/lib/core/metering';
import { grantDefaultQuota } from '@/lib/core/quota';
import { newId, hashPassword } from '@/lib/core/crypto';
import { now } from '@/lib/core/util';
import { config } from '@/lib/config';
import { json, err } from '@/lib/api';
import { logAudit } from '@/lib/services/audit';
import type { AdminBody, AdminCtx } from './types';

export async function topup(body: AdminBody, { admin }: AdminCtx) {
  if (!body.userId || typeof body.deltaCents !== 'number' || !Number.isInteger(body.deltaCents)) {
    return err('userId and integer deltaCents required');
  }
  grantCents(body.userId, body.deltaCents, `admin top-up by ${admin.name}`);
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.topup',
    target: body.userId, detail: { deltaCents: body.deltaCents } });
  return json({ ok: true });
}

/** Field checks for createUser; returns the refusal response or null. */
function createUserCheck(body: AdminBody): { name: string; pw: string; credit: number } | ReturnType<typeof err> {
  const name = (body.name ?? '').trim();
  if (!/^[a-z0-9-]{3,32}$/.test(name)) return err('name: 3-32 chars of a-z 0-9 -');
  const pw = body.password as string;
  if (!body.password || pw.length < 8 || pw.length > 72) return err('password min 8 chars (72 is bcrypt cap)');
  if (rawDb().prepare(`select 1 from users where name=?`).get(name)) return err('name taken', 409);
  // Opening credit. Defaults to config.limits.defaultBalanceCents (0), never
  // to something generous: a new account starts unfunded until an admin
  // decides otherwise. A negative or nonsense figure is a client bug.
  const credit = body.creditCents === undefined ? config.limits.defaultBalanceCents : body.creditCents;
  if (!Number.isInteger(credit) || credit < 0) return err('creditCents must be a whole number of cents >= 0');
  return { name, pw, credit };
}

/** Insert the users row plus the optional opening-credit ledger row. */
function insertNewUser(id: string, name: string, role: string, pw: string, credit: number, adminName: string, adminId: string) {
  const rd = rawDb();
  rd.transaction(() => {
    rd.prepare(`insert into users (id,name,role,password_hash,balance_cents,created_at) values (?,?,?,?,?,?)`)
      .run(id, name, role, hashPassword(pw), credit, now());
    if (credit > 0) {
      rd.prepare(`insert into ledger (id,user_id,delta_cents,reason,ref_type,ref_id,note,created_at)
        values (?,?,?,?,?,?,?,?)`)
        .run(newId('led_'), id, credit, 'grant', 'admin', adminId, `opening allocation by ${adminName}`, now());
    }
  })();
}

export async function createUser(body: AdminBody, { admin }: AdminCtx) {
  const checked = createUserCheck(body);
  if (checked instanceof Response) return checked;
  const { name, pw, credit } = checked;
  const role = body.role === 'admin' ? 'admin' : 'user';
  const id = newId('usr_');
  insertNewUser(id, name, role, pw, credit, admin.name, admin.id);
  // Provisioned but not permitted: zero of everything until an admin sets a
  // real quota. Insert-only, so it cannot clobber a later admin edit.
  grantDefaultQuota(id);
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.createUser',
    target: name, detail: { id, role, creditCents: credit } });
  return json({ ok: true, id, name, role, balanceCents: credit }, 201);
}

export async function setPassword(body: AdminBody, { admin }: AdminCtx) {
  if (!body.userId) return err('userId required');
  const pw = body.password ?? '';
  if (pw.length < 8 || pw.length > 72) return err('password: 8-72 chars (72 is bcrypt cap)');
  const u = await getDb().select().from(users).where(eq(users.id, body.userId));
  if (!u[0]) return err('user not found', 404);
  await getDb().update(users).set({ passwordHash: hashPassword(pw) }).where(eq(users.id, body.userId));
  // Existing sessions are JWTs and stay valid until they expire; this only
  // changes what the login form accepts from here on.
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.setPassword', target: u[0].name });
  return json({ ok: true });
}

/** Refusal when demoting this user would lock the panel; null when allowed. */
function demotionBlocked(u: { id: string; role: string }, role: string, admin: AdminCtx['admin']) {
  // Do not let an admin lock themselves (or the last admin) out of the
  // panel: demoting the final admin is unrecoverable from the UI.
  if (u.role !== 'admin' || role !== 'user') return null;
  if (u.id === admin.id) return err('you cannot demote your own account', 409);
  const admins = (rawDb().prepare(`select count(*) c from users where role='admin'`).get() as { c: number }).c;
  if (admins <= 1) return err('this is the last admin account', 409);
  return null;
}

export async function setRole(body: AdminBody, { admin }: AdminCtx) {
  if (!body.userId) return err('userId required');
  const role = body.role === 'admin' ? 'admin' : body.role === 'user' ? 'user' : null;
  if (!role) return err('role must be admin or user');
  const u = await getDb().select().from(users).where(eq(users.id, body.userId));
  if (!u[0]) return err('user not found', 404);
  const blocked = demotionBlocked(u[0], role, admin);
  if (blocked) return blocked;
  if (u[0].role === role) return json({ ok: true, role });
  await getDb().update(users).set({ role }).where(eq(users.id, body.userId));
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.setRole',
    target: u[0].name, detail: { from: u[0].role, to: role } });
  return json({ ok: true, role });
}

export async function deleteUser(body: AdminBody, { admin }: AdminCtx) {
  if (!body.userId) return err('userId required');
  if (body.userId === admin.id) return err('you cannot delete your own account', 409);
  const u = await getDb().select().from(users).where(eq(users.id, body.userId));
  if (!u[0]) return err('user not found', 404);
  const owned = (rawDb().prepare(`select count(*) c from instances where user_id=?`).get(body.userId) as { c: number }).c;
  if (owned > 0) {
    // Deleting the account would strand qcow2 overlays, leases and VNC
    // sockets with no owner to bill or blame. Make the admin destroy the
    // instances first, where each destroy goes through the normal handler.
    return err(`${u[0].name} still owns ${owned} instance${owned === 1 ? '' : 's'} — delete ${owned === 1 ? 'it' : 'them'} first`, 409);
  }
  if (u[0].role === 'admin') {
    const admins = (rawDb().prepare(`select count(*) c from users where role='admin'`).get() as { c: number }).c;
    if (admins <= 1) return err('this is the last admin account', 409);
  }
  const rd = rawDb();
  const id = body.userId;
  rd.transaction(() => {
    // Instances are gone (checked above); sweep everything else that keys
    // off the account so a later id collision cannot inherit its history.
    rd.prepare(`delete from ssh_keys where user_id=?`).run(id);
    rd.prepare(`delete from quotas where user_id=?`).run(id);
    rd.prepare(`delete from instance_requests where user_id=?`).run(id);
    rd.prepare(`delete from deletion_requests where user_id=?`).run(id);
    rd.prepare(`delete from jobs where user_id=?`).run(id);
    // Ledger rows stay: they are the money trail, and an audit that can be
    // erased by deleting the account is not an audit.
    rd.prepare(`delete from users where id=?`).run(id);
  })();
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.deleteUser', target: u[0].name, detail: { id } });
  return json({ ok: true });
}
