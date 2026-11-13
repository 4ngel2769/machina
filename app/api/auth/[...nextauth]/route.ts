/**
 * next-auth catch-all handler.
 */
import { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
