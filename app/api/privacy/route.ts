// DPDP data-principal rights:
//   GET  ?type=lead|contact&id=…  → full data export (JSON) for the record
//   POST {type, id}               → right-to-erasure: anonymize PII while
//                                   preserving aggregates (deal values,
//                                   statuses, counts). Admin-only, audited.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toRupees } from '@/lib/server/db';
import { deleteAttachment } from '@/lib/server/storage';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  if (!id || (type !== 'lead' && type !== 'contact')) {
    return NextResponse.json({ error: 'type and id required' }, { status: 400 });
  }

  const activities = await prisma.salesActivity.findMany({
    where: { relatedType: type, relatedId: id },
    orderBy: { createdAt: 'asc' },
  });

  if (type === 'lead') {
    const lead = await prisma.lead.findFirst({
      where: { id, ownerId: { in: ctx.visible } },
      include: {
        owner: { select: { name: true } },
        attachments: {
          select: { name: true, size: true, mimeType: true, uploadedAt: true },
        },
        campaign: { select: { name: true } },
      },
    });
    if (!lead) return notFound();
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      subject: 'lead',
      record: {
        name: lead.name,
        company: lead.company,
        phone: lead.phone,
        email: lead.email,
        source: lead.source,
        status: lead.status,
        owner: lead.owner.name,
        estimatedValue: toRupees(lead.estimatedPaise),
        notes: lead.notes,
        campaign: lead.campaign?.name ?? null,
        consentAt: lead.consentAt,
        createdAt: lead.createdAt,
      },
      attachments: lead.attachments,
      activities: activities.map((a) => ({
        kind: a.kind,
        subject: a.subject,
        notes: a.notes,
        dueAt: a.dueAt,
        completedAt: a.completedAt,
        createdAt: a.createdAt,
      })),
    });
  }

  const contact = await prisma.contact.findFirst({
    where: { id, ownerId: { in: ctx.visible } },
    include: {
      owner: { select: { name: true } },
      account: { select: { name: true } },
      deals: { select: { title: true, stage: true, valuePaise: true } },
    },
  });
  if (!contact) return notFound();
  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    subject: 'contact',
    record: {
      name: contact.name,
      company: contact.company,
      title: contact.title,
      phone: contact.phone,
      email: contact.email,
      owner: contact.owner.name,
      account: contact.account?.name ?? null,
      createdAt: contact.createdAt,
    },
    deals: contact.deals.map((d) => ({
      title: d.title,
      stage: d.stage,
      value: toRupees(d.valuePaise),
    })),
    activities: activities.map((a) => ({
      kind: a.kind,
      subject: a.subject,
      notes: a.notes,
      dueAt: a.dueAt,
      completedAt: a.completedAt,
      createdAt: a.createdAt,
    })),
  });
}

const eraseSchema = z.object({
  type: z.enum(['lead', 'contact']),
  id: z.string(),
});

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'view_admin')) {
    return forbidden('Erasure requests are handled by the administrator');
  }
  const body = await parseBody(req, eraseSchema);
  if (!body.ok) return body.res;
  const { type, id } = body.data;
  const now = new Date();

  if (type === 'lead') {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) return notFound();
    // Best-effort S3 cleanup before the DB rows go.
    const attachments = await prisma.leadAttachment.findMany({
      where: { leadId: id, s3Key: { not: null } },
      select: { s3Key: true },
    });
    for (const a of attachments) {
      try {
        if (a.s3Key) await deleteAttachment(a.s3Key);
      } catch {
        // object may already be gone
      }
    }
    await prisma.$transaction([
      prisma.leadAttachment.deleteMany({ where: { leadId: id } }),
      prisma.salesActivity.updateMany({
        where: { relatedType: 'lead', relatedId: id },
        data: { notes: '' },
      }),
      prisma.lead.update({
        where: { id },
        data: {
          name: '[Erased on request]',
          phone: '',
          email: '',
          notes: '',
          erasedAt: now,
        },
      }),
      prisma.auditEvent.create({
        data: {
          type: 'pii_erased',
          message: 'Lead PII erased on data-principal request',
          actorId: ctx.actor.id,
          entity: `lead:${id}`,
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return notFound();
  await prisma.$transaction([
    prisma.salesActivity.updateMany({
      where: { relatedType: 'contact', relatedId: id },
      data: { notes: '' },
    }),
    prisma.contact.update({
      where: { id },
      data: {
        name: '[Erased on request]',
        phone: '',
        email: '',
        title: '',
        erasedAt: now,
        archived: true,
      },
    }),
    prisma.auditEvent.create({
      data: {
        type: 'pii_erased',
        message: 'Contact PII erased on data-principal request',
        actorId: ctx.actor.id,
        entity: `contact:${id}`,
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
