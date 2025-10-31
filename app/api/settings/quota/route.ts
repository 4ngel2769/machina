import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getUserQuota } from '@/lib/quota-system';

// GET /api/settings/quota - Get current user's quota
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const quota = await getUserQuota(session.user.id);

    if (!quota) {
      return NextResponse.json({ error: 'Quota not found' }, { status: 404 });
    }

    return NextResponse.json(quota);
  } catch (error) {
    console.error('Error fetching user quota:', error);
    return NextResponse.json({ error: 'Failed to fetch quota' }, { status: 500 });
  }
}