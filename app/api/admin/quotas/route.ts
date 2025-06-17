import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import {
  getAllQuotas,
  getUserQuota,
  setUserQuota,
  setUserSuspended,
  deleteUserQuota,
} from '@/lib/quota-system';
import { getAllUsers } from '@/lib/auth/user-storage';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';

// GET /api/admin/quotas - Get all user quotas (admin only)
// GET /api/admin/quotas?userId=xxx - Get specific user quota (admin only)
export async function GET(request: NextRequest) {
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
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (userId) {
      const quota = await getUserQuota(userId);
      if (!quota) {
        return NextResponse.json({ error: 'Quota not found' }, { status: 404 });
      }
      return NextResponse.json(quota);
    }
    
    const allQuotas = await getAllQuotas();
    return NextResponse.json(allQuotas);
  } catch (error) {
    console.error('Error fetching quotas:', error);
    return NextResponse.json({ error: 'Failed to fetch quotas' }, { status: 500 });
  }
}

// PUT /api/admin/quotas - Update user quota (admin only)
export async function PUT(request: NextRequest) {
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
    
    const body = await request.json();
    const { userId, username, quotas, isAdmin } = body;
    
    if (!userId || !username) {
      return NextResponse.json(
        { error: 'userId and username are required' },
        { status: 400 }
      );
    }
    
    const updatedQuota = await setUserQuota(userId, username, quotas || {}, isAdmin);
    return NextResponse.json(updatedQuota);
  } catch (error) {
    console.error('Error updating quota:', error);
    return NextResponse.json({ error: 'Failed to update quota' }, { status: 500 });
  }
}

// PATCH /api/admin/quotas - Suspend/unsuspend user (admin only)
export async function PATCH(request: NextRequest) {
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
    
    const body = await request.json();
    const { userId, suspended } = body;
    
    if (!userId || typeof suspended !== 'boolean') {
      return NextResponse.json(
        { error: 'userId and suspended (boolean) are required' },
        { status: 400 }
      );
    }
    
    await setUserSuspended(userId, suspended);
    return NextResponse.json({ success: true, userId, suspended });
  } catch (error) {
    console.error('Error suspending/unsuspending user:', error);
    return NextResponse.json({ error: 'Failed to update suspension status' }, { status: 500 });
  }
}

// DELETE /api/admin/quotas?userId=xxx - Delete user quota (admin only)
export async function DELETE(request: NextRequest) {
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
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    
    await deleteUserQuota(userId);
    return NextResponse.json({ success: true, userId });
  } catch (error) {
    console.error('Error deleting quota:', error);
    return NextResponse.json({ error: 'Failed to delete quota' }, { status: 500 });
  }
}

// POST /api/admin/quotas/initialize - Initialize missing quotas for all users (admin only)
export async function POST(request: NextRequest) {
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
    
    const users = await getAllUsers();
    const existingQuotas = await getAllQuotas();
    const existingUserIds = new Set(existingQuotas.map(q => q.userId));
    
    const missingQuotas = users.filter(user => !existingUserIds.has(user.id));
    const results = [];
    
    for (const user of missingQuotas) {
      try {
        const quota = await setUserQuota(user.id, user.username, undefined, user.role === 'admin');
        results.push({
          userId: user.id,
          username: user.username,
          status: 'created',
          tokenBalance: quota.tokenBalance,
        });
      } catch (error) {
        console.error(`Failed to create quota for user ${user.username}:`, error);
        results.push({
          userId: user.id,
          username: user.username,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      initialized: results.filter(r => r.status === 'created').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    });
  } catch (error) {
    console.error('Error initializing quotas:', error);
    return NextResponse.json({ error: 'Failed to initialize quotas' }, { status: 500 });
  }
}

