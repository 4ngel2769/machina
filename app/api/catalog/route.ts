/**
 * Plan and image catalogue visible to the signed-in user.
 */
import { requireUser } from '@/lib/auth';
import { json, err } from '@/lib/api';
import { getDb } from '@/lib/db';
import { plans, images, users } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';

/** Session-visible catalog: active plans + images with sync status. */
export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const db = getDb();
  const [userSettings] = await db.select({ imagePickable: users.imagePickable, assignedImageId: users.assignedImageId }).from(users).where(eq(users.id, user.id));
  return json({
    // ordered smallest -> largest: ram then vcpu, so the plan list always
    // reads as a size ladder regardless of insertion order
    // Custom plans size one existing box; they are not tiers anyone may pick.
    plans: await db.select().from(plans).where(and(eq(plans.active, 1), eq(plans.custom, 0)))
      .orderBy(asc(plans.ramMb), asc(plans.vcpu), asc(plans.diskGb)),
    images: await db.select({ id: images.id, name: images.name, status: images.status }).from(images),
    imagePickable: userSettings?.imagePickable ?? 1,
    assignedImageId: userSettings?.assignedImageId ?? null,
  });
}
