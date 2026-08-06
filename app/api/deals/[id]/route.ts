import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toPaise } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import {
  moveDealStage,
  setDealDiscount,
  setDealLineItems,
} from '@/lib/server/deals';
import { serializeDeal, serializeQuote } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

async function findVisible(id: string, visible: string[]) {
  return prisma.deal.findFirst({
    where: { id, ownerId: { in: visible }, archived: false },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible }, archived: false },
    include: {
      owner: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, accountId: true } },
      lineItems: { include: { product: { select: { name: true, sku: true } } } },
      quotes: { orderBy: { createdAt: 'desc' } },
      approvals: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          requestedBy: { select: { id: true, name: true } },
          decider: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!deal) return notFound();
  return NextResponse.json({
    deal: serializeDeal(deal),
    quotes: deal.quotes.map(serializeQuote),
    approvals: deal.approvals.map((a) => ({
      id: a.id,
      discountPercent: a.discountBps / 100,
      status: a.status,
      note: a.note,
      decisionNote: a.decisionNote,
      requestedBy: a.requestedBy,
      decider: a.decider,
      createdAt: a.createdAt.toISOString(),
      decidedAt: a.decidedAt?.toISOString() ?? null,
    })),
  });
}

const patchSchema = z.object({
  title: z.string().min(2).optional(),
  value: z.number().min(0).optional(),
  expectedClose: z.string().datetime().optional(),
  stage: z
    .enum(['qualification', 'proposal', 'negotiation', 'won', 'lost'])
    .optional(),
  lostReason: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        productId: z.string(),
        qty: z.number().int().min(1),
        price: z.number().min(0),
      }),
    )
    .optional(),
  /** Discount percent 0–50, applied to the line-item total. */
  discountPercent: z.number().min(0).max(50).optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const existing = await findVisible(params.id, ctx.visible);
  if (!existing) return notFound();

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  if (
    input.archived === true &&
    !hasCapability(ctx.actor.role, 'archive_records')
  ) {
    return forbidden('Your role cannot archive records');
  }

  try {
    // Stage move runs through the transactional service (notifications,
    // audit, closed-state rules).
    if (input.stage && input.stage !== existing.stage) {
      await moveDealStage(ctx.actor, existing.id, input.stage, input.lostReason);
    }
    if (input.lineItems) {
      await setDealLineItems(ctx.actor, existing.id, input.lineItems);
    }
    if (input.discountPercent != null) {
      await setDealDiscount(
        ctx.actor,
        existing.id,
        Math.round(input.discountPercent * 100),
      );
    }
    const closed = ['won', 'lost'].includes(input.stage ?? existing.stage);
    const hasItems =
      input.lineItems != null
        ? input.lineItems.length > 0
        : (await prisma.dealLineItem.count({ where: { dealId: existing.id } })) > 0;

    await prisma.deal.update({
      where: { id: existing.id },
      data: {
        ...(input.title != null ? { title: input.title } : {}),
        // Manual value only when line items don't own it and deal is open.
        ...(input.value != null && !hasItems && !closed
          ? { valuePaise: toPaise(input.value) }
          : {}),
        ...(input.expectedClose != null && !closed
          ? { expectedClose: new Date(input.expectedClose) }
          : {}),
        ...(input.archived != null ? { archived: input.archived } : {}),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }

  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: existing.id },
    include: {
      owner: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, accountId: true } },
      lineItems: { include: { product: { select: { name: true, sku: true } } } },
    },
  });
  return NextResponse.json({ deal: serializeDeal(deal) });
}
