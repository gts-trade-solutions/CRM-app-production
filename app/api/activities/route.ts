import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import { ACTIVITY_INCLUDE } from '@/lib/server/activities';
import {
  actorContext,
  badRequest,
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
        ownerId: { in: ctx.visible },
        // A record's timeline includes multi-record tasks that merely list it,
        // otherwise a "call these five leads" task would show on one lead only.
        OR: [
          { relatedType, relatedId },
          { targets: { some: { relatedType, relatedId } } },
        ],
      }
    : scope === 'team'
      ? { ownerId: { in: ctx.visible.filter((id) => id !== ctx.actor.id) } }
      : { ownerId: ctx.actor.id };

  const rows = await prisma.salesActivity.findMany({
    where,
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: ACTIVITY_INCLUDE,
  });

  // Resolve related-record display names in three batched queries, covering
  // both the primary record and every target.
  const pairs = rows.flatMap((r) => [
    { type: r.relatedType, id: r.relatedId },
    ...r.targets.map((t) => ({ type: t.relatedType, id: t.relatedId })),
  ]);
  const idsBy = (t: string) =>
    Array.from(new Set(pairs.filter((p) => p.type === t).map((p) => p.id)));
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
    activities: rows.map((r) => {
      const wire = serializeActivity(r);
      return {
        ...wire,
        relatedName: nameFor(r.relatedType, r.relatedId),
        relatedHref: hrefFor(r.relatedType, r.relatedId),
        targets: wire.targets.map((t) => ({
          ...t,
          name: nameFor(t.relatedType, t.relatedId),
          href: hrefFor(t.relatedType, t.relatedId),
        })),
      };
    }),
  });
}

const relatedRef = z.object({
  relatedType: z.enum(['lead', 'deal', 'contact']),
  relatedId: z.string(),
});

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
  /**
   * Every record this one task has to touch — "call these five leads". The
   * first is mirrored into relatedType/relatedId so single-record consumers
   * keep working unchanged.
   */
  targets: z.array(relatedRef).max(50).optional(),
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

  // De-duplicate: the same record twice would make the progress count lie.
  const targets = input.targets
    ? Array.from(
        new Map(
          input.targets.map((t) => [`${t.relatedType}:${t.relatedId}`, t]),
        ).values(),
      )
    : [];
  if (input.targets && targets.length === 0) {
    return badRequest('Pick at least one record for the task');
  }
  const primary = targets[0] ?? {
    relatedType: input.relatedType,
    relatedId: input.relatedId,
  };

  const completedAt = input.completedAt ? new Date(input.completedAt) : null;
  const activity = await prisma.salesActivity.create({
    data: {
      kind: input.kind,
      subject: input.subject,
      notes: input.notes,
      relatedType: primary.relatedType,
      relatedId: primary.relatedId,
      ownerId,
      createdById: ctx.actor.id,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      completedAt,
      lat: input.location?.lat ?? null,
      lng: input.location?.lng ?? null,
      targets: targets.length
        ? {
            create: targets.map((t) => ({
              relatedType: t.relatedType,
              relatedId: t.relatedId,
              // Logging a done multi-record activity marks every record done.
              completedAt,
            })),
          }
        : undefined,
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
