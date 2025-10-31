import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getUserQuota } from '@/lib/quota-system';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';

// GET /api/admin/quotas/[userId] - Get quota for a specific user (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Rate limiting
    const identifier = getRateLimitIdentifier(request, session.user.id);
    const rateLimitResult = await rateLimit(request, identifier, 'api');
    if (rateLimitResult) {
      return rateLimitResult;
    }

    const { userId } = params;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const quota = await getUserQuota(userId);

    if (!quota) {
      return NextResponse.json({ error: 'Quota not found' }, { status: 404 });
    }

    return NextResponse.json(quota);
  } catch (error) {
    console.error('Error fetching user quota:', error);
    return NextResponse.json({ error: 'Failed to fetch user quota' }, { status: 500 });
  }
}