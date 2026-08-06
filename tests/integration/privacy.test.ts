// DPDP erasure semantics against the real database: PII gone, aggregates
// preserved, activities scrubbed, audit written.

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';

const created: string[] = [];

afterAll(async () => {
  await prisma.salesActivity.deleteMany({
    where: { relatedId: { in: created } },
  });
  await prisma.lead.deleteMany({ where: { id: { in: created } } });
  await prisma.auditEvent.deleteMany({
    where: { message: { contains: 'IT Privacy' } },
  });
  await prisma.$disconnect();
});

describe('right-to-erasure (lead)', () => {
  it('anonymizes PII, scrubs activity notes, keeps business fields', async () => {
    const lead = await prisma.lead.create({
      data: {
        name: 'IT Privacy Subject',
        company: 'Privacy Co',
        phone: '+91 9888877777',
        email: 'subject@privacy.in',
        source: 'referral',
        ownerId: 'u6',
        estimatedPaise: BigInt(50_000_00),
        notes: 'Sensitive personal detail',
        consentAt: new Date(),
      },
    });
    created.push(lead.id);
    await prisma.salesActivity.create({
      data: {
        kind: 'call',
        subject: 'Call about IT Privacy',
        notes: 'Discussed private matters',
        relatedType: 'lead',
        relatedId: lead.id,
        ownerId: 'u6',
        createdById: 'u6',
      },
    });

    // Mirror the erasure transaction the endpoint performs.
    await prisma.$transaction([
      prisma.leadAttachment.deleteMany({ where: { leadId: lead.id } }),
      prisma.salesActivity.updateMany({
        where: { relatedType: 'lead', relatedId: lead.id },
        data: { notes: '' },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          name: '[Erased on request]',
          phone: '',
          email: '',
          notes: '',
          erasedAt: new Date(),
        },
      }),
      prisma.auditEvent.create({
        data: {
          type: 'pii_erased',
          message: 'IT Privacy erasure test',
          actorId: 'u1',
          entity: `lead:${lead.id}`,
        },
      }),
    ]);

    const after = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(after.name).toBe('[Erased on request]');
    expect(after.phone).toBe('');
    expect(after.email).toBe('');
    expect(after.notes).toBe('');
    expect(after.erasedAt).not.toBeNull();
    // Business aggregates survive.
    expect(after.estimatedPaise).toBe(BigInt(50_000_00));
    expect(after.status).toBe('new');

    const activity = await prisma.salesActivity.findFirstOrThrow({
      where: { relatedType: 'lead', relatedId: lead.id },
    });
    expect(activity.notes).toBe('');
    expect(activity.subject).toContain('Call'); // subjects retained
  });
});
