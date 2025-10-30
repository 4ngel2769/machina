import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getLogs, ActivityAction } from '@/lib/activity-logger';
//import { attachOwnershipInfo } from '@/lib/resource-ownership';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    
    // Parse filters from query params
    const userId = searchParams.get('userId') || undefined;
    const action = searchParams.get('action') as ActivityAction | undefined;
    const resourceType = searchParams.get('resourceType') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const { logs, total } = getLogs({
      userId,
      action,
      resourceType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      logs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
