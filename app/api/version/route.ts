import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    // Read package.json for version info
    const packagePath = join(process.cwd(), 'package.json');
    const packageData = await readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(packageData);

    // Get build time from environment or use current time
    const buildDate = process.env.BUILD_DATE || new Date().toISOString();
    
    // Get commit hash from environment (set during build)
    const commitHash = process.env.COMMIT_HASH || 'dev';

    return NextResponse.json({
      version: pkg.version || '0.1.0',
      name: pkg.name || 'Machina',
      description: pkg.description || 'KVM & Docker Management Platform',
      buildDate,
      commitHash,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    console.error('Error reading version info:', error);
    return NextResponse.json(
      { error: 'Failed to read version information' },
      { status: 500 }
    );
  }
}
