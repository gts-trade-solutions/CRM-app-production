import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { serializeActivity } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

/**
 * scope=mine (default): the actor's own activities.
 * scope=team: subordinates' activities (managers).
 * relatedType+relatedId: a record's timeline.
 */
export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope') ?? 'mine';
  const relatedType = searchParams.get('relatedType');
  const relatedId = searchParams.get('relatedId');

  const where = relatedType && relatedId
    ? {
        relatedType,
        relatedId,
        ownerId: { in: ctx.visible },
      }
    : scope === 'team'
      ? { ownerId: { in: ctx.visible.filter((id) => id !== ctx.actor.id) } }
      : { ownerId: ctx.actor.id };

  const rows = await prisma.salesActivity.findMany({
    where,
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      owner: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  // Resolve related-record display names in three batched queries.
  const idsBy = (t: string) =>
    rows.filter((r) => r.relatedType === t).map((r) => r.relatedId);
  const [leads, deals, contacts] = await Promise.all([
    prisma.lead.findMany({
      where: { id: { in: idsBy('lead') } },
      select: { id: true, name: true, company: true },
    }),
    prisma.deal.findMany({
      where: { id: { in: idsBy('deal') } },
      select: { id: true, title: true },
    }),
    prisma.contact.findMany({
      where: { id: { in: idsBy('contact') } },
      select: { id: true, name: true },
    }),
  ]);
  const nameFor = (type: string, id: string): string => {
    if (type === 'lead') {
      const l = leads.find((x) => x.id === id);
      return l ? `${l.name}${l.company ? ` (${l.company})` : ''}` : 'Lead';
    }
    if (type === 'deal') return deals.find((x) => x.id === id)?.title ?? 'Deal';
    return contacts.find((x) => x.id === id)?.name ?? 'Contact';
  };
  const hrefFor = (type: string, id: string) =>
    type === 'lead'
      ? `/leads/${id}`
      : type === 'deal'
        ? `/pipeline/${id}`
        : `/contacts/${id}`;

  return NextResponse.json({
    activities: rows.map((r) => ({
      ...serializeActivity(r),
      relatedName: nameFor(r.relatedType, r.relatedId),
      relatedHref: hrefFor(r.relatedType, r.relatedId),
    })),
  });
}

const createSchema = z.object({
  kind: z.enum(['call', 'meeting', 'task', 'email', 'note']),
  subject: z.string().min(2),
  notes: z.string().default(''),
  relatedType: z.enum(['lead', 'deal', 'contact']),
  relatedId: z.string(),
  ownerId: z.string().optional(),
  dueAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  const ownerId = input.ownerId ?? ctx.actor.id;
  if (ownerId !== ctx.actor.id) {
    if (!hasCapability(ctx.actor.role, 'assign_activities')) {
      return forbidden('Your role cannot assign activities');
    }
    if (!ctx.visible.includes(ownerId)) {
      return forbidden('Assignee is outside your scope');
    }
  }

  const activity = await prisma.salesActivity.create({
    data: {
      kind: input.kind,
      subject: input.subject,
      notes: input.notes,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      ownerId,
      createdById: ctx.actor.id,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      completedAt: input.completedAt ? new Date(input.completedAt) : null,
      lat: input.location?.lat ?? null,
      lng: input.location?.lng ?? null,
    },
  });

  if (ownerId !== ctx.actor.id) {
    await prisma.notification.create({
      data: {
        userId: ownerId,
        message: `${ctx.actor.name} assigned you: ${input.subject}`,
        href: '/activities',
      },
    });
  }

  return NextResponse.json({ id: activity.id }, { status: 201 });
}
