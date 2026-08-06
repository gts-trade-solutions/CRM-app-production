// Exemplar resource endpoint — the pattern every entity follows in M2/M3:
// session identity (requireUser), zod-validated input, server-side RBAC
// scoping, paise→rupee conversion at the wire, pagination.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toPaise, toRupees } from '@/lib/server/db';
import { requireUser } from '@/lib/server/auth';
import { visibleUserIdsFor } from '@/lib/server/rbac';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const status = searchParams.get('status') ?? undefined;
  const q = searchParams.get('q')?.trim();

  const visible = await visibleUserIdsFor(actor.id);
  const where = {
    ownerId: { in: visible },
    ...(status
      ? { status: status as 'new' | 'contacted' | 'qualified' | 'converted' | 'disqualified' }
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
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { owner: { select: { id: true, name: true } } },
    }),
  ]);

  return NextResponse.json({
    page,
    pageSize: PAGE_SIZE,
    total,
    leads: rows.map((l) => ({
      id: l.id,
      name: l.name,
      company: l.company,
      phone: l.phone,
      email: l.email,
      source: l.source,
      status: l.status,
      owner: l.owner,
      estimatedValue: toRupees(l.estimatedPaise),
      campaignId: l.campaignId,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
  });
}

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
  ownerId: z.string().optional(),
  estimatedValue: z.number().min(0).default(0),
  notes: z.string().default(''),
  campaignId: z.string().optional(),
  /** Offline-sync dedupe key (M4): same key → same lead, not a duplicate. */
  idempotencyKey: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const parsed = createLeadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Owner must be inside the actor's subtree.
  const ownerId = input.ownerId ?? actor.id;
  const visible = await visibleUserIdsFor(actor.id);
  if (!visible.includes(ownerId)) {
    return NextResponse.json(
      { error: 'Owner is outside your scope' },
      { status: 403 },
    );
  }

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
    },
  });

  await prisma.auditEvent.create({
    data: {
      type: 'lead_created',
      message: `New lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
      actorId: actor.id,
      entity: `lead:${lead.id}`,
    },
  });

  return NextResponse.json({ id: lead.id }, { status: 201 });
}
