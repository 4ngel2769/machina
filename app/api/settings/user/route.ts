import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import {
  getUserSettings,
  updateUserSettings,
  type UserSettings,
} from '@/lib/settings-storage';
import logger from '@/lib/logger';

// GET /api/settings/user - Get current user's settings
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = getUserSettings(session.user.id);
    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Error fetching user settings', { error });
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PATCH /api/settings/user - Update current user's settings
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updates: Partial<UserSettings> = await request.json();
    const success = updateUserSettings(session.user.id, updates);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 }
      );
    }

    const updated = getUserSettings(session.user.id);
    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    logger.error('Error updating user settings', { error });
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
