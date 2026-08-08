import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import {
  ACTIVITY_INCLUDE,
  setActivityCompletion,
  setTargetCompletion,
} from '@/lib/server/activities';
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
  /** Tick one record of a multi-record task; omit to tick the whole task. */
  targetId: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const existing = await prisma.salesActivity.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible } },
    include: { targets: { select: { id: true } } },
  });
  if (!existing) return notFound();

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.res;
  const { completed, targetId } = body.data;

  if (targetId) {
    // Scoped to this activity so a valid target id from someone else's task
    // cannot be ticked through here.
    if (!existing.targets.some((t) => t.id === targetId)) return notFound();
    await setTargetCompletion(existing.id, targetId, completed);
  } else {
    await setActivityCompletion(existing.id, completed);
  }

  const activity = await prisma.salesActivity.findUniqueOrThrow({
    where: { id: existing.id },
    include: ACTIVITY_INCLUDE,
  });
  return NextResponse.json({ activity: serializeActivity(activity) });
}
