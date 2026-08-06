import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { requireUser } from '@/lib/server/auth';
import { unauthenticated } from '@/lib/server/api';
import { serializeNotification } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) return unauthenticated();
  const rows = await prisma.notification.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const unread = await prisma.notification.count({
    where: { userId: actor.id, read: false },
  });
  return NextResponse.json({
    unread,
    notifications: rows.map(serializeNotification),
  });
}

/** Marks all of the actor's notifications read. */
export async function POST(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) return unauthenticated();
  await prisma.notification.updateMany({
    where: { userId: actor.id, read: false },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
