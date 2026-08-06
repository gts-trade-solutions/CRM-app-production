// Quote generation: numbered snapshot of the deal's line items, GST from
// org settings, counter incremented in the same transaction.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import {
  actorContext,
  notFound,
  unauthenticated,
} from '@/lib/server/api';
import { serializeQuote } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible }, archived: false },
    include: { lineItems: true },
  });
  if (!deal) return notFound();
  if (deal.lineItems.length === 0) {
    return NextResponse.json(
      { error: 'Add line items before generating a quotation' },
      { status: 400 },
    );
  }

  const quote = await prisma.$transaction(async (tx) => {
    const org = await tx.orgSettings.findUniqueOrThrow({ where: { id: 1 } });
    const subtotal = deal.lineItems.reduce(
      (s, it) => s + it.pricePaise * BigInt(it.qty),
      BigInt(0),
    );
    const gst =
      (subtotal * BigInt(org.gstRateBps)) / BigInt(10000);
    const now = new Date();
    const number = `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(org.quoteCounter).padStart(4, '0')}`;
    await tx.orgSettings.update({
      where: { id: 1 },
      data: { quoteCounter: org.quoteCounter + 1 },
    });
    return tx.quote.create({
      data: {
        dealId: deal.id,
        number,
        subtotalPaise: subtotal,
        gstPaise: gst,
        totalPaise: subtotal + gst,
        createdById: ctx.actor.id,
      },
    });
  });

  return NextResponse.json({ quote: serializeQuote(quote) }, { status: 201 });
}
