// Data quality: duplicate detection groups (normalized phone / lowercased
// email shared by multiple leads or contacts in scope) and same-kind merge
// with relations re-pointed in one transaction.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

const norm = (p: string) => p.replace(/\D/g, '');

interface DupeRecord {
  kind: 'lead' | 'contact';
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  ownerName: string;
  status?: string;
}

export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();

  const [leads, contacts] = await Promise.all([
    prisma.lead.findMany({
      where: { ownerId: { in: ctx.visible } },
      include: { owner: { select: { name: true } } },
    }),
    prisma.contact.findMany({
      where: { ownerId: { in: ctx.visible }, archived: false },
      include: { owner: { select: { name: true } } },
    }),
  ]);

  const records: (DupeRecord & { keys: string[] })[] = [
    ...leads.map((l) => ({
      kind: 'lead' as const,
      id: l.id,
      name: l.name,
      company: l.company,
      phone: l.phone,
      email: l.email,
      ownerName: l.owner.name,
      status: l.status,
      keys: [
        norm(l.phone).length >= 6 ? `p:${norm(l.phone)}` : '',
        l.email ? `e:${l.email.trim().toLowerCase()}` : '',
      ].filter(Boolean),
    })),
    ...contacts.map((c) => ({
      kind: 'contact' as const,
      id: c.id,
      name: c.name,
      company: c.company,
      phone: c.phone,
      email: c.email,
      ownerName: c.owner.name,
      keys: [
        norm(c.phone).length >= 6 ? `p:${norm(c.phone)}` : '',
        c.email ? `e:${c.email.trim().toLowerCase()}` : '',
      ].filter(Boolean),
    })),
  ];

  const byKey = new Map<string, (DupeRecord & { keys: string[] })[]>();
  for (const r of records) {
    for (const key of r.keys) {
      const list = byKey.get(key) ?? [];
      list.push(r);
      byKey.set(key, list);
    }
  }

  // Groups with >1 record; dedupe groups that share members.
  const seenGroup = new Set<string>();
  const groups: { key: string; records: DupeRecord[] }[] = [];
  for (const [key, list] of Array.from(byKey.entries())) {
    if (list.length < 2) continue;
    const signature = list
      .map((r) => `${r.kind}:${r.id}`)
      .sort()
      .join('|');
    if (seenGroup.has(signature)) continue;
    seenGroup.add(signature);
    groups.push({
      key,
      records: list.map(({ keys: _keys, ...rest }) => rest),
    });
    if (groups.length >= 50) break;
  }

  return NextResponse.json({ groups });
}

const mergeSchema = z.object({
  kind: z.enum(['lead', 'contact']),
  survivorId: z.string(),
  duplicateId: z.string(),
});

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'archive_records')) {
    return forbidden('Your role cannot merge records');
  }
  const body = await parseBody(req, mergeSchema);
  if (!body.ok) return body.res;
  const { kind, survivorId, duplicateId } = body.data;
  if (survivorId === duplicateId) {
    return NextResponse.json(
      { error: 'Survivor and duplicate must differ' },
      { status: 400 },
    );
  }

  if (kind === 'lead') {
    const [survivor, dupe] = await Promise.all([
      prisma.lead.findFirst({
        where: { id: survivorId, ownerId: { in: ctx.visible } },
      }),
      prisma.lead.findFirst({
        where: { id: duplicateId, ownerId: { in: ctx.visible } },
        include: { contact: { select: { id: true } } },
      }),
    ]);
    if (!survivor || !dupe) return notFound();
    if (dupe.status === 'converted' || dupe.contact) {
      return NextResponse.json(
        { error: 'Converted leads cannot be merged away — merge the contacts instead' },
        { status: 409 },
      );
    }
    await prisma.$transaction([
      prisma.leadAttachment.updateMany({
        where: { leadId: dupe.id },
        data: { leadId: survivor.id },
      }),
      prisma.salesActivity.updateMany({
        where: { relatedType: 'lead', relatedId: dupe.id },
        data: { relatedId: survivor.id },
      }),
      // Backfill empty survivor fields from the duplicate.
      prisma.lead.update({
        where: { id: survivor.id },
        data: {
          company: survivor.company || dupe.company,
          email: survivor.email || dupe.email,
          notes: survivor.notes || dupe.notes,
        },
      }),
      prisma.lead.delete({ where: { id: dupe.id } }),
      prisma.auditEvent.create({
        data: {
          type: 'records_merged',
          message: `Lead “${dupe.name}” merged into “${survivor.name}”`,
          actorId: ctx.actor.id,
          entity: `lead:${survivor.id}`,
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  // Contact merge
  const [survivor, dupe] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: survivorId, ownerId: { in: ctx.visible } },
    }),
    prisma.contact.findFirst({
      where: { id: duplicateId, ownerId: { in: ctx.visible } },
    }),
  ]);
  if (!survivor || !dupe) return notFound();

  await prisma.$transaction([
    prisma.deal.updateMany({
      where: { contactId: dupe.id },
      data: { contactId: survivor.id },
    }),
    prisma.salesActivity.updateMany({
      where: { relatedType: 'contact', relatedId: dupe.id },
      data: { relatedId: survivor.id },
    }),
    // Detach the dupe's unique lead link first — the survivor may inherit it.
    prisma.contact.update({
      where: { id: dupe.id },
      data: { leadId: null },
    }),
    prisma.contact.update({
      where: { id: survivor.id },
      data: {
        company: survivor.company || dupe.company,
        title: survivor.title || dupe.title,
        email: survivor.email || dupe.email,
        accountId: survivor.accountId ?? dupe.accountId,
        leadId: survivor.leadId ?? dupe.leadId,
      },
    }),
    prisma.contact.delete({ where: { id: dupe.id } }),
    prisma.auditEvent.create({
      data: {
        type: 'records_merged',
        message: `Contact “${dupe.name}” merged into “${survivor.name}”`,
        actorId: ctx.actor.id,
        entity: `contact:${survivor.id}`,
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
