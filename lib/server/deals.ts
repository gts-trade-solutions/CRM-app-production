// Deal domain services — the logic with side effects (notifications,
// audit, closed-state rules) lives here, not in route handlers, so it can
// be integration-tested directly.

import type { DealStage, User } from '@prisma/client';
import { prisma, toPaise } from './db';

const CLOSED: DealStage[] = ['won', 'lost'];

/** Line-item total minus the deal discount, in paise. */
export function discountedValuePaise(
  itemsTotalPaise: bigint,
  discountBps: number,
): bigint {
  return (
    (itemsTotalPaise * BigInt(10000 - discountBps)) / BigInt(10000)
  );
}

/**
 * Sets the deal's discount and recomputes the value from its line items.
 * Closed deals are immutable.
 */
export async function setDealDiscount(
  actor: User,
  dealId: string,
  discountBps: number,
) {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: { lineItems: true },
    });
    if (CLOSED.includes(deal.stage)) {
      throw new Error('Closed deals cannot be modified');
    }
    const itemsTotal = deal.lineItems.reduce(
      (s, it) => s + it.pricePaise * BigInt(it.qty),
      BigInt(0),
    );
    return tx.deal.update({
      where: { id: dealId },
      data: {
        discountBps,
        ...(deal.lineItems.length > 0
          ? { valuePaise: discountedValuePaise(itemsTotal, discountBps) }
          : {}),
      },
    });
  });
}

/**
 * Moves a deal to a stage inside one transaction: sets/clears closedAt and
 * lostReason, notifies the owner (when someone else moved it) and the
 * owner's manager (on secured orders), and writes the audit event.
 */
export async function moveDealStage(
  actor: User,
  dealId: string,
  stage: DealStage,
  lostReason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: { owner: true },
    });
    if (deal.stage === stage) return deal;

    const closed = CLOSED.includes(stage);
    const stageSetting = await tx.stageSetting.findUnique({
      where: { stage },
    });
    const label = stageSetting?.label ?? stage;

    const updated = await tx.deal.update({
      where: { id: dealId },
      data: {
        stage,
        closedAt: closed ? new Date() : null,
        lostReason: stage === 'lost' ? lostReason ?? null : null,
      },
    });

    if (deal.ownerId !== actor.id) {
      await tx.notification.create({
        data: {
          userId: deal.ownerId,
          message: `${actor.name} moved “${deal.title}” to ${label}`,
          href: `/pipeline/${deal.id}`,
        },
      });
    }
    if (stage === 'won' && deal.owner.managerId && deal.owner.managerId !== actor.id) {
      const rupees = Number(deal.valuePaise) / 100;
      await tx.notification.create({
        data: {
          userId: deal.owner.managerId,
          message: `${deal.owner.name} secured “${deal.title}” at ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees)}`,
          href: `/pipeline/${deal.id}`,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        type: stage === 'won' ? 'deal_won' : stage === 'lost' ? 'deal_lost' : 'deal_stage',
        message: `${deal.title} moved to ${label}`,
        actorId: actor.id,
        entity: `deal:${deal.id}`,
      },
    });

    return updated;
  });
}

/**
 * Replaces a deal's line items and recomputes its value from them.
 * Closed deals are immutable.
 */
export async function setDealLineItems(
  actor: User,
  dealId: string,
  items: { productId: string; qty: number; price: number }[],
) {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId } });
    if (CLOSED.includes(deal.stage)) {
      throw new Error('Closed deals cannot be modified');
    }
    await tx.dealLineItem.deleteMany({ where: { dealId } });
    if (items.length > 0) {
      await tx.dealLineItem.createMany({
        data: items.map((it) => ({
          dealId,
          productId: it.productId,
          qty: it.qty,
          pricePaise: toPaise(it.price),
        })),
      });
      const totalPaise = BigInt(
        items.reduce(
          (sum, it) => sum + Math.round(it.price * 100) * it.qty,
          0,
        ),
      );
      await tx.deal.update({
        where: { id: dealId },
        data: {
          valuePaise: discountedValuePaise(totalPaise, deal.discountBps),
        },
      });
    }
    return tx.deal.findUniqueOrThrow({
      where: { id: dealId },
      include: { lineItems: true },
    });
  });
}
