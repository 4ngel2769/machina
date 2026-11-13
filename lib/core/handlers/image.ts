/**
 * Image handler: run one base-image sync (download, verify, pool placement).
 */
import { syncImage } from '../images';
import type { JobCtx } from '../handlers';

export async function imageSync(job: JobCtx, log: (m: string) => void): Promise<void> {
  const payload = JSON.parse(job.payload || '{}') as { imageId: string };
  log(`syncing ${payload.imageId}`);
  await syncImage(payload.imageId);
  log('done');
}
