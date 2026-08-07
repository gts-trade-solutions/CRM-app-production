// Leads collection — the reference resource endpoint pattern.
// GET: RBAC-scoped, paginated, filterable (status / channel / q).
// POST: creation with round-robin auto-assign ('__auto' picks the visible
// rep with the fewest open leads), inline attachments, and idempotency-key
// dedupe for offline capture.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toPaise } from '@/lib/server/db';
import {
  actorContext,
  forbidden,
  pagination,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { serializeLead } from '@/lib/server/serialize';
import { storeAttachment } from '@/lib/server/storage';
import { SOURCE_CONFIG, LeadSource } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ONLINE_SOURCES = (Object.keys(SOURCE_CONFIG) as LeadSource[]).filter(
  (s) => SOURCE_CONFIG[s].channel === 'online',
);
const OFFLINE_SOURCES = (Object.keys(SOURCE_CONFIG) as LeadSource[]).filter(
  (s) => SOURCE_CONFIG[s].channel === 'offline',
);

export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? undefined;
  const channel = searchParams.get('channel') ?? undefined;
  const q = searchParams.get('q')?.trim();
  const ownerId = searchParams.get('ownerId') ?? undefined;
  const campaignId = searchParams.get('campaignId') ?? undefined;
  const { page, pageSize, skip, take } = pagination(req);

  const where = {
    // A specific owner filter still stays inside the actor's scope.
    ownerId:
      ownerId && ctx.visible.includes(ownerId)
        ? ownerId
        : { in: ctx.visible },
    ...(campaignId ? { campaignId } : {}),
    ...(status
      ? { status: status as 'new' | 'contacted' | 'qualified' | 'converted' | 'disqualified' }
      : {}),
    ...(channel === 'online'
      ? { source: { in: ONLINE_SOURCES } }
      : channel === 'offline'
        ? { source: { in: OFFLINE_SOURCES } }
        : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { company: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        owner: { select: { id: true, name: true } },
        _count: { select: { attachments: true } },
      },
    }),
  ]);

  // Engagement counts feed the lead score client-side.
  const ids = rows.map((l) => l.id);
  const activityCounts = ids.length
    ? await prisma.salesActivity.groupBy({
        by: ['relatedId'],
        where: { relatedType: 'lead', relatedId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const countById = new Map(
    activityCounts.map((c) => [c.relatedId, c._count._all]),
  );

  return NextResponse.json({
    page,
    pageSize,
    total,
    leads: rows.map((l) => ({
      ...serializeLead(l),
      activityCount: countById.get(l.id) ?? 0,
      attachmentCount: l._count.attachments,
    })),
  });
}

const attachmentSchema = z.object({
  name: z.string(),
  size: z.number().int().min(0),
  type: z.string(),
  dataUrl: z.string().optional(),
});

const createLeadSchema = z.object({
  name: z.string().min(2),
  company: z.string().default(''),
  phone: z.string().min(6),
  email: z.string().email().or(z.literal('')).default(''),
  source: z.enum([
    'website',
    'social_media',
    'email_campaign',
    'marketplace',
    'walk_in',
    'phone',
    'field_visit',
    'event',
    'referral',
  ]),
  /** A user id, or '__auto' for round-robin assignment. */
  ownerId: z.string().optional(),
  estimatedValue: z.number().min(0).default(0),
  notes: z.string().default(''),
  campaignId: z.string().optional(),
  attachments: z.array(attachmentSchema).max(10).optional(),
  /** Offline-capture dedupe key: replays return the existing lead. */
  idempotencyKey: z.string().max(64).optional(),
  /** True when the client queued this while offline (badge in UI). */
  capturedOffline: z.boolean().optional(),
  /** DPDP: the data principal consented to being contacted. */
  consent: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const body = await parseBody(req, createLeadSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  // Idempotent replay from the offline outbox.
  if (input.idempotencyKey) {
    const existing = await prisma.lead.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return NextResponse.json({ id: existing.id, deduped: true });
    }
  }

  // Resolve owner: explicit (must be in scope) or fairest-rep auto-assign.
  let ownerId = input.ownerId ?? ctx.actor.id;
  if (input.ownerId === '__auto') {
    const reps = await prisma.user.findMany({
      where: { id: { in: ctx.visible }, role: 'sales_rep', active: true },
      select: { id: true },
    });
    if (reps.length === 0) {
      ownerId = ctx.actor.id;
    } else {
      const openCounts = await prisma.lead.groupBy({
        by: ['ownerId'],
        where: {
          ownerId: { in: reps.map((r) => r.id) },
          status: { in: ['new', 'contacted', 'qualified'] },
        },
        _count: { _all: true },
      });
      const countByOwner = new Map(
        openCounts.map((c) => [c.ownerId, c._count._all]),
      );
      ownerId = reps
        .map((r) => ({ id: r.id, open: countByOwner.get(r.id) ?? 0 }))
        .sort((a, b) => a.open - b.open)[0].id;
    }
  } else if (!ctx.visible.includes(ownerId)) {
    return forbidden('Owner is outside your scope');
  }

  const storedAttachments = input.attachments?.length
    ? await Promise.all(
        input.attachments.map(async (a) => ({
          name: a.name,
          size: a.size,
          mimeType: a.type,
          ...(await storeAttachment(a)),
          uploaderId: ctx.actor.id,
        })),
      )
    : [];

  const lead = await prisma.lead.create({
    data: {
      name: input.name,
      company: input.company,
      phone: input.phone,
      email: input.email,
      source: input.source,
      ownerId,
      estimatedPaise: toPaise(input.estimatedValue),
      notes: input.notes,
      campaignId: input.campaignId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      consentAt: input.consent ? new Date() : null,
      pendingSync: false,
      attachments: storedAttachments.length
        ? { create: storedAttachments }
        : undefined,
    },
  });

  if (ownerId !== ctx.actor.id) {
    await prisma.notification.create({
      data: {
        userId: ownerId,
        message: `New lead assigned to you: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
        href: `/leads/${lead.id}`,
      },
    });
  }
  await prisma.auditEvent.create({
    data: {
      type: 'lead_created',
      message: `New lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}${input.capturedOffline ? ' (offline capture)' : ''}`,
      actorId: ctx.actor.id,
      entity: `lead:${lead.id}`,
    },
  });

  return NextResponse.json({ id: lead.id, ownerId }, { status: 201 });
}
