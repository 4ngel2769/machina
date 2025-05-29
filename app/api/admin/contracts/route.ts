import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import {
  getAllContracts,
  getActiveContracts,
  getUserContracts,
  createContract,
  updateContractStatus,
  deleteContract,
  getContractsDueForRefill,
} from '@/lib/user-contracts';
import { addTokens } from '@/lib/quota-system';

// GET /api/admin/contracts - Get contracts
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter');
    const userId = searchParams.get('userId');
    
    let contracts;
    
    if (session.user.role === 'admin') {
      if (userId) {
        contracts = await getUserContracts(userId);
      } else if (filter === 'active') {
        contracts = await getActiveContracts();
      } else if (filter === 'due') {
        contracts = await getContractsDueForRefill();
      } else {
        contracts = await getAllContracts();
      }
    } else {
      // Regular users only see their own contracts
      contracts = await getUserContracts(session.user.id);
    }
    
    return NextResponse.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
  }
}

// POST /api/admin/contracts - Create new contract (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { userId, username, tokensPerMonth, durationMonths, notes, initialRefill } = body;
    
    if (!userId || !username || !tokensPerMonth || !durationMonths) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    if (tokensPerMonth <= 0 || durationMonths <= 0) {
      return NextResponse.json({ error: 'Invalid values' }, { status: 400 });
    }
    
    const contract = await createContract(
      userId,
      username,
      tokensPerMonth,
      durationMonths,
      session.user.name || session.user.id,
      notes
    );
    
    // Optionally add initial tokens
    if (initialRefill) {
      await addTokens(userId, tokensPerMonth);
    }
    
    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error creating contract:', error);
    return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 });
  }
}

// PATCH /api/admin/contracts - Update contract status (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { contractId, status } = body;
    
    if (!contractId || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const contract = await updateContractStatus(contractId, status);
    
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }
    
    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error updating contract:', error);
    return NextResponse.json({ error: 'Failed to update contract' }, { status: 500 });
  }
}

// DELETE /api/admin/contracts - Delete contract (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Contract ID required' }, { status: 400 });
    }
    
    const deleted = await deleteContract(id);
    
    if (!deleted) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contract:', error);
    return NextResponse.json({ error: 'Failed to delete contract' }, { status: 500 });
  }
}
