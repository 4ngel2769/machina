import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { addTokens, removeTokens, setTokenBalance, getUserQuota } from '@/lib/quota-system';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';

// Validation schemas
const addTokensSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
});

const removeTokensSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
});

const setBalanceSchema = z.object({
  userId: z.string().min(1),
  balance: z.number().int().min(0),
});

// POST /api/admin/tokens - Add tokens to user
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
    const { userId, amount } = addTokensSchema.parse(body);

    // Add tokens
    const newBalance = await addTokens(userId, amount);

    return NextResponse.json({
      success: true,
      userId,
      tokenBalance: newBalance,
      added: amount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error adding tokens:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add tokens' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/tokens - Remove tokens from user
export async function DELETE(request: NextRequest) {
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
    const { userId, amount } = removeTokensSchema.parse(body);

    // Remove tokens
    const newBalance = await removeTokens(userId, amount);

    return NextResponse.json({
      success: true,
      userId,
      tokenBalance: newBalance,
      removed: amount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error removing tokens:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove tokens' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/tokens - Set token balance
export async function PUT(request: NextRequest) {
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
    const { userId, balance } = setBalanceSchema.parse(body);

    // Set token balance
    const newBalance = await setTokenBalance(userId, balance);

    return NextResponse.json({
      success: true,
      userId,
      tokenBalance: newBalance,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error setting token balance:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set token balance' },
      { status: 500 }
    );
  }
}

// GET /api/admin/tokens - Get user token balance
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

    // Get userId from query params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Get user quota (includes token balance)
    const quota = await getUserQuota(userId);

    return NextResponse.json({
      userId,
      tokenBalance: quota.tokenBalance,
      currentPlan: quota.currentPlan,
      planActivatedAt: quota.planActivatedAt,
      planExpiresAt: quota.planExpiresAt,
    });
  } catch (error) {
    console.error('Error getting token balance:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get token balance' },
      { status: 500 }
    );
  }
}
