import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import {
  getGlobalSettings,
  saveGlobalSettings,
  resetGlobalSettings,
  exportAllSettings,
  importSettings,
  type GlobalSettings,
} from '@/lib/settings-storage';
import { logAudit } from '@/lib/audit-logger';
import logger from '@/lib/logger';

// GET /api/settings/global - Get global settings
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = getGlobalSettings();
    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Error fetching global settings', { error });
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/global - Update global settings (admin only)
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settings: GlobalSettings = await request.json();
    const success = saveGlobalSettings(settings);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 }
      );
    }

    await logAudit({
      userId: session.user.id,
      username: session.user.name || session.user.id,
      action: 'update',
      resourceType: 'setting',
      resourceId: 'global',
      resourceName: 'Global Settings',
      success: true,
    });

    logger.info('Global settings updated', { userId: session.user.id });

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    logger.error('Error updating global settings', { error });
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

// POST /api/settings/global/reset - Reset to defaults (admin only)
export async function POST() {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const success = resetGlobalSettings();

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to reset settings' },
        { status: 500 }
      );
    }

    await logAudit({
      userId: session.user.id,
      username: session.user.name || session.user.id,
      action: 'update',
      resourceType: 'setting',
      resourceId: 'global',
      resourceName: 'Global Settings',
      success: true,
      details: 'Reset to defaults',
    });

    logger.info('Global settings reset to defaults', { userId: session.user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error resetting global settings', { error });
    return NextResponse.json(
      { error: 'Failed to reset settings' },
      { status: 500 }
    );
  }
}

// POST /api/settings/global/export - Export all settings
export async function PATCH() {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const exported = exportAllSettings();
    
    return NextResponse.json(exported);
  } catch (error) {
    logger.error('Error exporting settings', { error });
    return NextResponse.json(
      { error: 'Failed to export settings' },
      { status: 500 }
    );
  }
}

// POST /api/settings/global/import - Import settings
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const result = importSettings(data);
    
    await logAudit({
      userId: session.user.id,
      username: session.user.name || session.user.id,
      action: 'update',
      resourceType: 'setting',
      resourceId: 'import',
      resourceName: 'Settings Import',
      success: result.success,
      details: `Imported ${result.imported.users} user settings`,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Error importing settings', { error });
    return NextResponse.json(
      { error: 'Failed to import settings' },
      { status: 500 }
    );
  }
}
