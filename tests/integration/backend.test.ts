// Backend-core guarantees, verified against the real local MySQL:
//  1. Server-side RBAC subtree visibility matches the org hierarchy.
//  2. Lead conversion is one transaction — all records or none, and the
//     account is matched (not duplicated) case-insensitively.
// Assumes `npx prisma db seed` has run; restores what it changes.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, toRupees } from '@/lib/server/db';
import { visibleUserIdsFor } from '@/lib/server/rbac';
import { convertLead } from '@/lib/server/convert';

beforeAll(async () => {
  const users = await prisma.user.count();
  if (users === 0) {
    throw new Error('Database is empty — run `npx prisma db seed` first.');
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('server-side RBAC', () => {
  it('a rep sees only themself', async () => {
    expect(await visibleUserIdsFor('u6')).toEqual(['u6']);
  });

  it('a team lead sees self + their reps', async () => {
    expect(new Set(await visibleUserIdsFor('u4'))).toEqual(
      new Set(['u4', 'u6', 'u7']),
    );
  });

  it('a regional manager sees their whole region', async () => {
    expect(new Set(await visibleUserIdsFor('u3'))).toEqual(
      new Set(['u3', 'u5', 'u8', 'u9']),
    );
  });

  it('admin sees everyone; unknown user sees nothing', async () => {
    expect((await visibleUserIdsFor('u1')).length).toBe(
      await prisma.user.count(),
    );
    expect(await visibleUserIdsFor('ghost')).toEqual([]);
  });
});

describe('transactional lead conversion', () => {
  const cleanup: { leadIds: string[] } = { leadIds: [] };

  async function makeLead(company: string) {
    const lead = await prisma.lead.create({
      data: {
        name: `IT Test ${Date.now()}`,
        company,
        phone: `+91 90${String(Date.now()).slice(-8)}`,
        email: '',
        source: 'referral',
        ownerId: 'u6',
        notes: '',
      },
    });
    cleanup.leadIds.push(lead.id);
    return lead;
  }

  afterAll(async () => {
    // Remove everything the tests created, children first.
    const contacts = await prisma.contact.findMany({
      where: { leadId: { in: cleanup.leadIds } },
    });
    const contactIds = contacts.map((c) => c.id);
    await prisma.deal.deleteMany({ where: { contactId: { in: contactIds } } });
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.account.deleteMany({
      where: { name: { startsWith: 'IT-Co-' } },
    });
    await prisma.lead.deleteMany({ where: { id: { in: cleanup.leadIds } } });
    await prisma.auditEvent.deleteMany({
      where: { message: { contains: 'IT Test' } },
    });
  });

  it('creates account + contact + deal and flips the lead in one go', async () => {
    const company = `IT-Co-${Date.now()}`;
    const lead = await makeLead(company);
    const result = await convertLead('u6', lead.id, 'IT Test deal', 250000);

    const deal = await prisma.deal.findUniqueOrThrow({
      where: { id: result.dealId },
      include: { contact: true },
    });
    expect(toRupees(deal.valuePaise)).toBe(250000);
    expect(deal.stage).toBe('qualification');
    expect(deal.contact.leadId).toBe(lead.id);
    expect(deal.contact.accountId).toBe(result.accountId);
    expect(result.accountCreated).toBe(true);

    const updated = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(updated.status).toBe('converted');
  });

  it('matches an existing account case-insensitively instead of duplicating', async () => {
    const company = `IT-Co-${Date.now()}-match`;
    const first = await makeLead(company);
    const a = await convertLead('u6', first.id, 'IT Test deal A', 100000);

    const second = await makeLead(company.toUpperCase());
    const b = await convertLead('u6', second.id, 'IT Test deal B', 100000);

    expect(b.accountId).toBe(a.accountId);
    expect(b.accountCreated).toBe(false);
    const accounts = await prisma.account.count({
      where: { name: company },
    });
    expect(accounts).toBe(1);
  });

  it('refuses double conversion and writes nothing on failure', async () => {
    const company = `IT-Co-${Date.now()}-double`;
    const lead = await makeLead(company);
    await convertLead('u6', lead.id, 'IT Test deal', 50000);

    const dealsBefore = await prisma.deal.count();
    const contactsBefore = await prisma.contact.count();
    await expect(
      convertLead('u6', lead.id, 'IT Test deal again', 50000),
    ).rejects.toThrow('already converted');
    expect(await prisma.deal.count()).toBe(dealsBefore);
    expect(await prisma.contact.count()).toBe(contactsBefore);
  });
});
