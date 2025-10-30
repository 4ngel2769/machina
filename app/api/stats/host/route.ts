import { NextResponse } from 'next/server';
import { getHostStats } from '@/lib/system-stats';

export async function GET() {
  try {
    const stats = await getHostStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error getting host stats:', error);
    return NextResponse.json(
      { error: 'Failed to get host stats' },
      { status: 500 }
    );
  }
}
