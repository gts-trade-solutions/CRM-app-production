// Bulk lead reassignment — capability-gated, scope-checked both ways.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  leadIds: z.array(z.string()).min(1).max(500),
  newOwnerId: z.string(),
});

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'reassign_records')) {
    return forbidden('Your role cannot reassign records');
  }
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const { leadIds, newOwnerId } = body.data;

  if (!ctx.visible.includes(newOwnerId)) {
    return forbidden('New owner is outside your scope');
  }

  const result = await prisma.lead.updateMany({
    where: { id: { in: leadIds }, ownerId: { in: ctx.visible } },
    data: { ownerId: newOwnerId },
  });

  if (result.count > 0) {
    const owner = await prisma.user.findUnique({ where: { id: newOwnerId } });
    if (newOwnerId !== ctx.actor.id) {
      await prisma.notification.create({
        data: {
          userId: newOwnerId,
          message: `${result.count} lead${result.count > 1 ? 's' : ''} reassigned to you`,
          href: '/leads',
        },
      });
    }
    await prisma.auditEvent.create({
      data: {
        type: 'lead_status',
        message: `${result.count} lead${result.count > 1 ? 's' : ''} reassigned to ${owner?.name ?? 'member'}`,
        actorId: ctx.actor.id,
      },
    });
  }
  return NextResponse.json({ reassigned: result.count });
}
