// Discount approval requests: the rep requests sign-off for the deal's
// current discount; the owner's manager is notified and decides.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import {
  actorContext,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

const schema = z.object({ note: z.string().max(500).default('') });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible }, archived: false },
    include: { owner: true },
  });
  if (!deal) return notFound();
  if (deal.discountBps <= 0) {
    return NextResponse.json(
      { error: 'Set a discount on the deal first' },
      { status: 400 },
    );
  }

  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;

  const existing = await prisma.approval.findFirst({
    where: { dealId: deal.id, status: 'pending' },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'An approval request is already pending for this deal' },
      { status: 409 },
    );
  }

  const approverId = deal.owner.managerId;
  if (!approverId) {
    return NextResponse.json(
      { error: 'The deal owner has no manager to approve this' },
      { status: 400 },
    );
  }

  const approval = await prisma.approval.create({
    data: {
      dealId: deal.id,
      discountBps: deal.discountBps,
      note: body.data.note,
      requestedById: ctx.actor.id,
    },
  });
  await prisma.notification.create({
    data: {
      userId: approverId,
      message: `${ctx.actor.name} requests approval: ${deal.discountBps / 100}% discount on “${deal.title}”`,
      href: `/pipeline/${deal.id}`,
    },
  });
  await prisma.auditEvent.create({
    data: {
      type: 'approval_requested',
      message: `Discount approval requested (${deal.discountBps / 100}%) on ${deal.title}`,
      actorId: ctx.actor.id,
      entity: `deal:${deal.id}`,
    },
  });
  return NextResponse.json({ id: approval.id }, { status: 201 });
}
