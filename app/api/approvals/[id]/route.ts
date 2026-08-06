// Approval decisions — approve_discounts capability, scoped to the
// decider's subtree; requesters cannot approve their own requests.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(['approved', 'rejected']),
  decisionNote: z.string().max(500).default(''),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'approve_discounts')) {
    return forbidden('Your role cannot decide approvals');
  }
  const approval = await prisma.approval.findFirst({
    where: {
      id: params.id,
      status: 'pending',
      deal: { ownerId: { in: ctx.visible } },
    },
    include: { deal: { select: { id: true, title: true } } },
  });
  if (!approval) return notFound('No pending approval found in your scope');
  if (approval.requestedById === ctx.actor.id) {
    return forbidden('You cannot decide your own request');
  }

  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const { status, decisionNote } = body.data;

  await prisma.$transaction([
    prisma.approval.update({
      where: { id: approval.id },
      data: {
        status,
        decisionNote,
        deciderId: ctx.actor.id,
        decidedAt: new Date(),
      },
    }),
    prisma.notification.create({
      data: {
        userId: approval.requestedById,
        message: `${ctx.actor.name} ${status} the ${approval.discountBps / 100}% discount on “${approval.deal.title}”${decisionNote ? ` — ${decisionNote}` : ''}`,
        href: `/pipeline/${approval.deal.id}`,
      },
    }),
    prisma.auditEvent.create({
      data: {
        type: `approval_${status}`,
        message: `Discount ${approval.discountBps / 100}% ${status} on ${approval.deal.title}`,
        actorId: ctx.actor.id,
        entity: `deal:${approval.deal.id}`,
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
