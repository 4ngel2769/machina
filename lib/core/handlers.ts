/**
 * Job handlers. Contract: handler throws -> job retries (with backoff) up to
 * maxAttempts, then 'failed'. Create failures ALWAYS clean their own partial
 * state (disk, seed) and set instance status='error'.
 *
 * The implementations live next to this file, grouped by what they act on:
 * create, snapshots, lifecycle (start/stop/delete) and image sync.
 */
import { create, waitSsh } from './handlers/create';
import { snapshot, snapshotRevert, snapshotDelete } from './handlers/snapshots';
import { start, stop, del } from './handlers/lifecycle';
import { imageSync } from './handlers/image';

export interface JobCtx {
  id: string;
  instanceId: string | null;
  payload: string;
}
type Handler = (job: JobCtx, log: (m: string) => void) => Promise<void>;

export const HANDLERS: Record<string, Handler> = {
  'instance.create': create,
  'instance.start': start,
  'instance.stop': stop,
  'instance.delete': del,
  'instance.snapshot': snapshot,
  'instance.snapshot-revert': snapshotRevert,
  'instance.snapshot-delete': snapshotDelete,
  'image.sync': imageSync,
};

export { waitSsh };
