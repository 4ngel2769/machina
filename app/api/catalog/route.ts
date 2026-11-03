import { requireUser } from '@/lib/auth';
import { json, err } from '@/lib/api';
import { getDb } from '@/lib/db';
import { plans, images, users } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

/** Session-visible catalog: active plans + images with sync status. */
export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const db = getDb();
  const [u] = await db.select({ imagePickable: users.imagePickable, assignedImageId: users.assignedImageId }).from(users).where(eq(users.id, user.id));
  return json({
    // ordered smallest -> largest: ram then vcpu, so the plan list always
    // reads as a size ladder regardless of insertion order
    plans: await db.select().from(plans).where(eq(plans.active, 1))
      .orderBy(asc(plans.ramMb), asc(plans.vcpu), asc(plans.diskGb)),
    images: await db.select({ id: images.id, name: images.name, status: images.status }).from(images),
    imagePickable: u?.imagePickable ?? 1,
    assignedImageId: u?.assignedImageId ?? null,
  });
}
