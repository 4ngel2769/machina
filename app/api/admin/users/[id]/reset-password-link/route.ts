import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getUserById } from '@/lib/auth/user-storage';
import PasswordResetToken from '@/lib/models/PasswordResetToken';
import { randomBytes } from 'crypto';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';

// POST /api/admin/users/[id]/reset-password-link - Generate password reset link (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check if user exists
    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate secure token
    const token = randomBytes(32).toString('hex');

    // Get expiration time from environment (default 24 hours)
    const expirationHours = parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRATION_HOURS || '24');
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    // Create password reset token
    await PasswordResetToken.create({
      userId: user.id,
      username: user.username,
      token,
      expiresAt,
      createdBy: session.user.id,
    });

    // Generate reset link
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.SERVER_PORT || 3000}`;
    const resetLink = `${baseUrl}/pwreset/${user.id}/${token}`;

    return NextResponse.json({
      success: true,
      resetLink,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Error generating password reset link:', error);
    return NextResponse.json({ error: 'Failed to generate password reset link' }, { status: 500 });
  }
}