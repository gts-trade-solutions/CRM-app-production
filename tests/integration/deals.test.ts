// Deal service guarantees against the real database: stage moves set
// closed-state fields and fan out notifications; line items own the deal
// value; closed deals are immutable.

import { afterAll, describe, expect, it } from 'vitest';
import { prisma, toRupees } from '@/lib/server/db';
import { moveDealStage, setDealLineItems } from '@/lib/server/deals';

const created: { dealIds: string[]; contactIds: string[] } = {
  dealIds: [],
  contactIds: [],
};

async function makeDeal(ownerId: string, valueRupees = 100000) {
  const contact = await prisma.contact.create({
    data: {
      name: `IT Deal Contact ${Date.now()}-${Math.random()}`,
      phone: '+91 9000000000',
      ownerId,
    },
  });
  created.contactIds.push(contact.id);
  const deal = await prisma.deal.create({
    data: {
      title: `IT Deal ${Date.now()}-${Math.random()}`,
      contactId: contact.id,
      ownerId,
      valuePaise: BigInt(valueRupees * 100),
      expectedClose: new Date(Date.now() + 30 * 86400_000),
    },
  });
  created.dealIds.push(deal.id);
  return deal;
}

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { message: { contains: 'IT Deal' } },
  });
  await prisma.auditEvent.deleteMany({
    where: { message: { contains: 'IT Deal' } },
  });
  await prisma.dealLineItem.deleteMany({
    where: { dealId: { in: created.dealIds } },
  });
  await prisma.deal.deleteMany({ where: { id: { in: created.dealIds } } });
  await prisma.contact.deleteMany({ where: { id: { in: created.contactIds } } });
  await prisma.$disconnect();
});

describe('moveDealStage', () => {
  it('securing an order sets closedAt and notifies the owner’s manager', async () => {
    const sneha = await prisma.user.findUniqueOrThrow({ where: { id: 'u6' } });
    const deal = await makeDeal('u6', 300000);
    const before = await prisma.notification.count({ where: { userId: 'u4' } });

    const updated = await moveDealStage(sneha, deal.id, 'won');
    expect(updated.stage).toBe('won');
    expect(updated.closedAt).not.toBeNull();

    // Rahul (u4) is Sneha's manager — he gets the secured-order alert.
    const after = await prisma.notification.count({ where: { userId: 'u4' } });
    expect(after).toBe(before + 1);
  });

  it('a manager moving a rep’s deal notifies the rep', async () => {
    const rahul = await prisma.user.findUniqueOrThrow({ where: { id: 'u4' } });
    const deal = await makeDeal('u6');
    const before = await prisma.notification.count({ where: { userId: 'u6' } });

    await moveDealStage(rahul, deal.id, 'negotiation');
    const after = await prisma.notification.count({ where: { userId: 'u6' } });
    expect(after).toBe(before + 1);
  });

  it('losing an order records the reason; reopening clears closed state', async () => {
    const sneha = await prisma.user.findUniqueOrThrow({ where: { id: 'u6' } });
    const deal = await makeDeal('u6');
    const lost = await moveDealStage(sneha, deal.id, 'lost', 'Price too high');
    expect(lost.lostReason).toBe('Price too high');
    expect(lost.closedAt).not.toBeNull();

    const reopened = await moveDealStage(sneha, deal.id, 'proposal');
    expect(reopened.closedAt).toBeNull();
    expect(reopened.lostReason).toBeNull();
  });
});

describe('setDealLineItems', () => {
  it('line items recompute the deal value', async () => {
    const sneha = await prisma.user.findUniqueOrThrow({ where: { id: 'u6' } });
    const deal = await makeDeal('u6', 50000);
    const updated = await setDealLineItems(sneha, deal.id, [
      { productId: 'p2', qty: 2, price: 120000 },
      { productId: 'p5', qty: 1, price: 35000 },
    ]);
    expect(toRupees(updated.valuePaise)).toBe(275000);
    expect(updated.lineItems.length).toBe(2);
  });

  it('closed deals reject line-item changes', async () => {
    const sneha = await prisma.user.findUniqueOrThrow({ where: { id: 'u6' } });
    const deal = await makeDeal('u6');
    await moveDealStage(sneha, deal.id, 'won');
    await expect(
      setDealLineItems(sneha, deal.id, [
        { productId: 'p2', qty: 1, price: 120000 },
      ]),
    ).rejects.toThrow('Closed deals');
  });
});
