import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { actorContext, unauthenticated } from '@/lib/server/api';
import { serializeUser } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

/** Users in the actor's visibility scope (owner selects, team views). */
export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const users = await prisma.user.findMany({
    where: { id: { in: ctx.visible } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ users: users.map(serializeUser) });
}
