import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth';
import { unauthenticated } from '@/lib/server/api';
import { serializeUser } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) return unauthenticated();
  return NextResponse.json({ user: serializeUser(actor) });
}
