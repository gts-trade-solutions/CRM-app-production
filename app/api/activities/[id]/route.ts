import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import {
  actorContext,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { serializeActivity } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  completed: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const existing = await prisma.salesActivity.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible } },
  });
  if (!existing) return notFound();

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.res;

  const activity = await prisma.salesActivity.update({
    where: { id: existing.id },
    data: { completedAt: body.data.completed ? new Date() : null },
  });
  return NextResponse.json({ activity: serializeActivity(activity) });
}
