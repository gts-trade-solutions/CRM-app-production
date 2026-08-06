import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toPaise } from '@/lib/server/db';
import {
  actorContext,
  forbidden,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { serializeDeal } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

/** Full open board (kanban) or a stage-filtered list. */
export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get('stage') ?? undefined;

  const deals = await prisma.deal.findMany({
    where: {
      ownerId: { in: ctx.visible },
      archived: false,
      ...(stage
        ? { stage: stage as 'qualification' | 'proposal' | 'negotiation' | 'won' | 'lost' }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, accountId: true } },
    },
  });
  return NextResponse.json({ deals: deals.map((d) => serializeDeal(d)) });
}

const createSchema = z.object({
  contactId: z.string(),
  title: z.string().min(2),
  value: z.number().min(0),
});

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, ownerId: { in: ctx.visible } },
  });
  if (!contact) return forbidden('Contact is outside your scope');

  const expectedClose = new Date();
  expectedClose.setDate(expectedClose.getDate() + 30);
  const deal = await prisma.deal.create({
    data: {
      title: input.title,
      contactId: contact.id,
      ownerId: contact.ownerId,
      valuePaise: toPaise(input.value),
      expectedClose,
    },
  });
  await prisma.auditEvent.create({
    data: {
      type: 'deal_created',
      message: `Deal created: ${deal.title}`,
      actorId: ctx.actor.id,
      entity: `deal:${deal.id}`,
    },
  });
  return NextResponse.json({ id: deal.id }, { status: 201 });
}
