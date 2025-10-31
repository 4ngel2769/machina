import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import {
  getAllRequests,
  getPendingRequests,
  getApprovedRequests,
  getDeniedRequests,
  getUserRequests,
  createRequest,
  approveRequest,
  denyRequest,
  deleteRequest,
} from '@/lib/token-requests';
import { addTokens } from '@/lib/quota-system';

// GET /api/token-requests - Get requests (users see their own, admins see all pending)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter');
    
    let requests;
    
    if (session.user.role === 'admin') {
      if (filter === 'pending') {
        requests = await getPendingRequests();
      } else if (filter === 'approved') {
        requests = await getApprovedRequests();
      } else if (filter === 'denied') {
        requests = await getDeniedRequests();
      } else {
        requests = await getAllRequests();
      }
    } else {
      // Regular users only see their own requests
      requests = await getUserRequests(session.user.id);
    }
    
    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error fetching token requests:', error);
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
  }
}

// POST /api/token-requests - Create new request
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { amount, reason } = body;
    
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    
    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
    }
    
    const request = await createRequest(
      session.user.id,
      session.user.name || session.user.id,
      amount,
      reason
    );
    
    return NextResponse.json(request);
  } catch (error) {
    console.error('Error creating token request:', error);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}

// PATCH /api/token-requests - Approve or deny request (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { requestId, action, notes } = body;
    
    if (!requestId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    let updatedRequest;
    
    if (action === 'approve') {
      updatedRequest = await approveRequest(requestId, session.user.name || session.user.id, notes);
      
      if (updatedRequest) {
        // Add tokens to user's balance
        await addTokens(updatedRequest.userId, updatedRequest.amount);
      }
    } else if (action === 'deny') {
      updatedRequest = await denyRequest(requestId, session.user.name || session.user.id, notes);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    
    if (!updatedRequest) {
      return NextResponse.json({ error: 'Request not found or already processed' }, { status: 404 });
    }
    
    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error('Error updating token request:', error);
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
  }
}

// DELETE /api/token-requests - Delete request
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 });
    }
    
    const deleted = await deleteRequest(id);
    
    if (!deleted) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting token request:', error);
    return NextResponse.json({ error: 'Failed to delete request' }, { status: 500 });
  }
}
