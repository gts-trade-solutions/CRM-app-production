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

  // Discounts above the org threshold need an approved sign-off covering
  // (at least) the deal's current discount.
  const org = await prisma.orgSettings.findUniqueOrThrow({ where: { id: 1 } });
  if (deal.discountBps > org.discountThresholdBps) {
    const approved = await prisma.approval.findFirst({
      where: {
        dealId: deal.id,
        status: 'approved',
        discountBps: { gte: deal.discountBps },
      },
    });
    if (!approved) {
      return NextResponse.json(
        {
          error: `A ${deal.discountBps / 100}% discount needs manager approval before quoting (threshold ${org.discountThresholdBps / 100}%)`,
          approvalRequired: true,
        },
        { status: 409 },
      );
    }
  }

  const quote = await prisma.$transaction(async (tx) => {
    const settings = await tx.orgSettings.findUniqueOrThrow({
      where: { id: 1 },
    });
    const subtotal = deal.lineItems.reduce(
      (s, it) => s + it.pricePaise * BigInt(it.qty),
      BigInt(0),
    );
    const discount =
      (subtotal * BigInt(deal.discountBps)) / BigInt(10000);
    const taxable = subtotal - discount;
    const gst = (taxable * BigInt(settings.gstRateBps)) / BigInt(10000);
    const now = new Date();
    const number = `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(settings.quoteCounter).padStart(4, '0')}`;
    await tx.orgSettings.update({
      where: { id: 1 },
      data: { quoteCounter: settings.quoteCounter + 1 },
    });
    return tx.quote.create({
      data: {
        dealId: deal.id,
        number,
        subtotalPaise: subtotal,
        discountPaise: discount,
        gstPaise: gst,
        totalPaise: taxable + gst,
        createdById: ctx.actor.id,
      },
    });
  });

  return NextResponse.json({ quote: serializeQuote(quote) }, { status: 201 });
}
