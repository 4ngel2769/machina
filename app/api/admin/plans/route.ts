import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { changePlan, getUserQuota } from '@/lib/quota-system';
import { getAvailablePlans, getPlanById } from '@/lib/token-plans';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';

// Validation schema
const changePlanSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
});

// GET /api/admin/plans - Get available plans or user's current plan
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin role check
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Rate limiting
    const rateLimitResult = await rateLimit(request, session.user.id);
    if (rateLimitResult) return rateLimitResult;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // If userId provided, get their current plan
    if (userId) {
      const quota = await getUserQuota(userId);
      const plan = getPlanById(quota.currentPlan);
      
      return NextResponse.json({
        userId,
        currentPlan: plan,
        planActivatedAt: quota.planActivatedAt,
        planExpiresAt: quota.planExpiresAt,
        tokenBalance: quota.tokenBalance,
      });
    }

    // Otherwise return all available plans
    const plans = getAvailablePlans();
    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Error getting plans:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get plans' },
      { status: 500 }
    );
  }
}

// POST /api/admin/plans - Change user's plan (admin can bypass token cost)
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin role check
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Rate limiting
    const rateLimitResult = await rateLimit(request, session.user.id);
    if (rateLimitResult) return rateLimitResult;

    // Parse and validate request
    const body = await request.json();
    const { userId, planId } = changePlanSchema.parse(body);

    // Validate plan exists
    const newPlan = getPlanById(planId);
    if (!newPlan) {
      return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    // Get current quota to check token balance
    const currentQuota = await getUserQuota(userId);
    
    // If user doesn't have enough tokens, admin can still force the change
    // by adding tokens first, or we can allow it here
    try {
      const updatedQuota = await changePlan(userId, planId);
      
      return NextResponse.json({
        success: true,
        userId,
        plan: newPlan,
        quota: updatedQuota,
      });
    } catch (error) {
      // If insufficient tokens, return helpful error
      if (error instanceof Error && error.message.includes('Insufficient tokens')) {
        return NextResponse.json({
          error: 'Insufficient tokens',
          details: {
            required: newPlan.tokenCost,
            available: currentQuota.tokenBalance,
            shortage: newPlan.tokenCost - currentQuota.tokenBalance,
          },
        }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error changing plan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to change plan' },
      { status: 500 }
    );
  }
}
