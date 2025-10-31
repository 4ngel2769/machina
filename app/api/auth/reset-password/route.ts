import { NextRequest, NextResponse } from 'next/server';
import { updateUser } from '@/lib/auth/user-storage';
import PasswordResetToken from '@/lib/models/PasswordResetToken';
import { rateLimit } from '@/lib/rate-limit';

// POST /api/auth/reset-password - Reset password using token
export async function POST(request: NextRequest) {
  try {
    // Rate limiting (use a generic identifier since user might not be authenticated)
    const rateLimitResult = await rateLimit(request, 'password-reset', 'create');
    if (rateLimitResult) {
      return rateLimitResult;
    }

    const body = await request.json();
    const { userId, token, newPassword } = body;

    if (!userId || !token || !newPassword) {
      return NextResponse.json(
        { error: 'User ID, token, and new password are required' },
        { status: 400 }
      );
    }

    // Validate password
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Find and validate the reset token
    const resetToken = await PasswordResetToken.findOne({
      userId,
      token,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    // Update the user's password
    await updateUser(userId, { password: newPassword });

    // Mark the token as used
    resetToken.used = true;
    await resetToken.save();

    // Clean up any other tokens for this user (optional - prevents reuse)
    await PasswordResetToken.updateMany(
      { userId, used: false },
      { used: true }
    );

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}