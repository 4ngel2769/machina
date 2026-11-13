/** Shared shapes for the admin op handlers. */

import type { NextResponse } from 'next/server';
import type { SessionUser } from '@/lib/api';

/** Every field any admin op reads off the request body. */
export type AdminBody = {
  op?: string; userId?: string; deltaCents?: number;
  name?: string; password?: string; role?: string; creditCents?: number;
  planId?: string; vcpu?: number; ramMb?: number; diskGb?: number;
  hourlyRateCents?: number; monthlyCapMin?: number; bandwidthGb?: number;
  imageId?: string; targetUserId?: string;
  imagePickable?: boolean; assignedImageId?: string | null;
};

export type AdminCtx = { admin: SessionUser };

export type OpHandler = (body: AdminBody, ctx: AdminCtx) => Promise<NextResponse>;
