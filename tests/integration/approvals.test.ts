// Discount + approval semantics against the real database: discount-aware
// value math and the quote gating rule (above-threshold needs an approved
// sign-off covering the current discount).

import { afterAll, describe, expect, it } from 'vitest';
import { prisma, toRupees } from '@/lib/server/db';
import {
  discountedValuePaise,
  setDealDiscount,
  setDealLineItems,
} from '@/lib/server/deals';

const created: { dealIds: string[]; contactIds: string[] } = {
  dealIds: [],
  contactIds: [],
};

async function makeDeal(ownerId: string) {
  const contact = await prisma.contact.create({
    data: {
      name: `IT Approval Contact ${Date.now()}-${Math.random()}`,
      phone: '+91 9000000001',
      ownerId,
    },
  });
  created.contactIds.push(contact.id);
  const deal = await prisma.deal.create({
    data: {
      title: `IT Approval Deal ${Date.now()}-${Math.random()}`,
      contactId: contact.id,
      ownerId,
      expectedClose: new Date(Date.now() + 30 * 86400_000),
    },
  });
  created.dealIds.push(deal.id);
  return deal;
}

afterAll(async () => {
  await prisma.approval.deleteMany({
    where: { dealId: { in: created.dealIds } },
  });
  await prisma.dealLineItem.deleteMany({
    where: { dealId: { in: created.dealIds } },
  });
  await prisma.deal.deleteMany({ where: { id: { in: created.dealIds } } });
  await prisma.contact.deleteMany({
    where: { id: { in: created.contactIds } },
  });
  await prisma.$disconnect();
});

describe('discount math', () => {
  it('discountedValuePaise applies basis points exactly', () => {
    expect(discountedValuePaise(BigInt(100_000_00), 1500)).toBe(
      BigInt(85_000_00),
    );
    expect(discountedValuePaise(BigInt(100_000_00), 0)).toBe(
      BigInt(100_000_00),
    );
  });

  it('deal value = items total minus discount, surviving item changes', async () => {
    const sneha = await prisma.user.findUniqueOrThrow({ where: { id: 'u6' } });
    const deal = await makeDeal('u6');
    await setDealLineItems(sneha, deal.id, [
      { productId: 'p2', qty: 2, price: 120000 },
    ]);
    await setDealDiscount(sneha, deal.id, 2000); // 20%
    let current = await prisma.deal.findUniqueOrThrow({
      where: { id: deal.id },
    });
    expect(toRupees(current.valuePaise)).toBe(192000); // 240000 × 0.8

    // Re-setting items keeps the discount applied.
    await setDealLineItems(sneha, deal.id, [
      { productId: 'p2', qty: 1, price: 120000 },
      { productId: 'p5', qty: 2, price: 35000 },
    ]);
    current = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(toRupees(current.valuePaise)).toBe(152000); // 190000 × 0.8
  });
});

describe('quote gating rule', () => {
  it('above-threshold discount requires an approved sign-off covering it', async () => {
    const org = await prisma.orgSettings.findUniqueOrThrow({ where: { id: 1 } });
    const sneha = await prisma.user.findUniqueOrThrow({ where: { id: 'u6' } });
    const deal = await makeDeal('u6');
    await setDealLineItems(sneha, deal.id, [
      { productId: 'p2', qty: 1, price: 120000 },
    ]);
    const above = org.discountThresholdBps + 500;
    await setDealDiscount(sneha, deal.id, above);

    // The exact predicate the quotes endpoint enforces:
    const gate = async () =>
      prisma.approval.findFirst({
        where: {
          dealId: deal.id,
          status: 'approved',
          discountBps: { gte: above },
        },
      });

    expect(await gate()).toBeNull(); // blocked

    // A pending request does not unblock.
    const approval = await prisma.approval.create({
      data: {
        dealId: deal.id,
        discountBps: above,
        requestedById: 'u6',
      },
    });
    expect(await gate()).toBeNull();

    // Approval by the manager unblocks.
    await prisma.approval.update({
      where: { id: approval.id },
      data: { status: 'approved', deciderId: 'u4', decidedAt: new Date() },
    });
    expect(await gate()).not.toBeNull();

    // Raising the discount beyond what was approved re-blocks.
    await setDealDiscount(sneha, deal.id, above + 500);
    const higherGate = await prisma.approval.findFirst({
      where: {
        dealId: deal.id,
        status: 'approved',
        discountBps: { gte: above + 500 },
      },
    });
    expect(higherGate).toBeNull();
  });
});
