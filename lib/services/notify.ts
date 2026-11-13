/**
 * In-app notifications: the write path every backend event uses.
 *
 * notify() is deliberately fire-and-forget safe — a notification failure must
 * never break the job that triggered it. Callers pass a kind that maps to the
 * UI's icon set; the row is the durable record, the bell badge is derived.
 */

import { rawDb } from '@/lib/db';
import { newId } from '@/lib/core/crypto';
import { now } from '@/lib/core/util';

export type NotifyKind = 'info' | 'ok' | 'warn' | 'error';

export type Notification = {
  id: string;
  kind: NotifyKind;
  title: string;
  body: string;
  link: string | null;
  readAt: number | null;
  createdAt: number;
};

/** Insert one notification. Never throws — logging it is enough. */
export function notify(
  userId: string,
  kind: NotifyKind,
  title: string,
  body = '',
  link: string | null = null,
): void {
  try {
    rawDb().prepare(
      `insert into notifications (id, user_id, kind, title, body, link, created_at)
       values (?,?,?,?,?,?,?)`,
    ).run(newId('ntf_'), userId, kind, title, body, link, now());
  } catch (error) {
    // A notification write failing is a bug worth seeing, not worth a crash.
    void error;
  }
}

/** Convenience for the common "instance did X" phrasing. */
export function notifyInstance(
  userId: string,
  kind: NotifyKind,
  instanceName: string,
  event: string,
  link?: string,
): void {
  notify(userId, kind, `${instanceName}: ${event}`, '', link ?? null);
}

/** All notifications for a user, newest first. */
export function listNotifications(userId: string, limit = 50): Notification[] {
  return rawDb().prepare(
    `select id, kind, title, body, link, read_at as readAt, created_at as createdAt
     from notifications where user_id=? order by created_at desc limit ?`,
  ).all(userId, limit) as Notification[];
}

export function unreadCount(userId: string): number {
  const row = rawDb().prepare(
    `select count(*) c from notifications where user_id=? and read_at is null`,
  ).get(userId) as { c: number };
  return row.c;
}

export function markRead(userId: string, id: string): boolean {
  const result = rawDb().prepare(
    `update notifications set read_at=? where id=? and user_id=? and read_at is null`,
  ).run(now(), id, userId);
  return result.changes > 0;
}

export function markAllRead(userId: string): number {
  return rawDb().prepare(
    `update notifications set read_at=? where user_id=? and read_at is null`,
  ).run(now(), userId).changes;
}

export function deleteNotification(userId: string, id: string): boolean {
  return rawDb().prepare(
    `delete from notifications where id=? and user_id=?`,
  ).run(id, userId).changes > 0;
}
