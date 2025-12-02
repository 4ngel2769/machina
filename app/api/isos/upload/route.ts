import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { ensureUserIsoDirectory, sanitizeIsoFilename, getMaxIsoUploadBytes, isPathWithinUserIsoDir } from '@/lib/iso-storage';
import fs from 'fs/promises';
import path from 'path';
import { logAudit } from '@/lib/audit-logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('iso');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'ISO file is required' }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith('.iso')) {
    return NextResponse.json({ error: 'Only .iso files are accepted' }, { status: 400 });
  }

  const maxBytes = getMaxIsoUploadBytes();
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `ISO exceeds maximum size of ${Math.floor(maxBytes / (1024 * 1024 * 1024))} GiB` }, { status: 413 });
  }

  try {
    const userDir = await ensureUserIsoDirectory(session.user.id);
    const filename = `${Date.now()}-${sanitizeIsoFilename(file.name)}`;
    const destination = path.join(userDir, filename);

    // Extra defence: ensure resolved path stays inside user dir
    if (!isPathWithinUserIsoDir(session.user.id, destination)) {
      return NextResponse.json({ error: 'Upload target rejected by security policy' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(destination, buffer, { mode: 0o600 });

    await logAudit({
      userId: session.user.id,
      username: session.user.name || session.user.id,
      action: 'upload',
      resourceType: 'iso',
      resourceName: filename,
      success: true,
      details: `Uploaded ISO (${(file.size / (1024 * 1024)).toFixed(2)} MB)`
    });

    return NextResponse.json({
      message: 'ISO uploaded successfully',
      path: destination,
      filename,
      size: file.size,
    });
  } catch (error) {
    console.error('Failed to upload ISO:', error);
    await logAudit({
      userId: session.user.id,
      username: session.user.name || session.user.id,
      action: 'upload',
      resourceType: 'iso',
      resourceName: file.name,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown upload error',
    });
    return NextResponse.json({ error: 'Failed to upload ISO' }, { status: 500 });
  }
}
