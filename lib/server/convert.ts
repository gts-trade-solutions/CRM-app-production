// Lead conversion — the flow that must be atomic. One transaction covers:
// account match-or-create, contact creation, deal creation, lead status
// flip, and the audit event. If any step fails, nothing is written — no
// ghost contacts, no orphaned deals.

import { Prisma } from '@prisma/client';
import { prisma, toPaise } from './db';

export interface ConvertResult {
  dealId: string;
  contactId: string;
  accountId: string | null;
  accountCreated: boolean;
}

export async function convertLead(
  actorId: string,
  leadId: string,
  dealTitle: string,
  valueRupees: number,
): Promise<ConvertResult> {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (lead.status === 'converted') {
      throw new Error('Lead is already converted');
    }

    // Account: case-insensitive match on the company name, else create.
    let accountId: string | null = null;
    let accountCreated = false;
    const company = lead.company.trim();
    if (company) {
      const existing = await tx.account.findFirst({
        where: { name: company }, // MySQL default collation is case-insensitive
      });
      if (existing) {
        accountId = existing.id;
      } else {
        const account = await tx.account.create({
          data: { name: company, ownerId: lead.ownerId },
        });
        accountId = account.id;
        accountCreated = true;
      }
    }

    const contact = await tx.contact.create({
      data: {
        name: lead.name,
        company: lead.company,
        phone: lead.phone,
        email: lead.email,
        ownerId: lead.ownerId,
        leadId: lead.id,
        accountId,
      },
    });

    const expectedClose = new Date();
    expectedClose.setDate(expectedClose.getDate() + 30);
    const deal = await tx.deal.create({
      data: {
        title: dealTitle,
        contactId: contact.id,
        ownerId: lead.ownerId,
        stage: 'qualification',
        valuePaise: toPaise(valueRupees),
        expectedClose,
      },
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: { status: 'converted' },
    });

    await tx.auditEvent.create({
      data: {
        type: 'lead_converted',
        message: `${lead.name} converted to contact + deal “${dealTitle}”`,
        actorId,
        entity: `lead:${lead.id}`,
      },
    });

    return { dealId: deal.id, contactId: contact.id, accountId, accountCreated };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
