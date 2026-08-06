// Campaigns: list with funnel metrics (auto-computed from attributed
// records), creation and budget/spend/status edits (manage_campaigns).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toPaise, toRupees } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const withMetrics =
    new URL(req.url).searchParams.get('metrics') === '1';

  const campaigns = await prisma.campaign.findMany({
    orderBy: { startDate: 'desc' },
  });

  let metricsById = new Map<
    string,
    { leadCount: number; convertedCount: number; pipeline: number; won: number }
  >();
  if (withMetrics) {
    const leads = await prisma.lead.findMany({
      where: { campaignId: { not: null }, ownerId: { in: ctx.visible } },
      select: {
        id: true,
        campaignId: true,
        status: true,
        contact: {
          select: {
            deals: {
              where: { archived: false },
              select: { stage: true, valuePaise: true },
            },
          },
        },
      },
    });
    metricsById = new Map(
      campaigns.map((c) => [
        c.id,
        { leadCount: 0, convertedCount: 0, pipeline: 0, won: 0 },
      ]),
    );
    for (const l of leads) {
      const m = metricsById.get(l.campaignId!);
      if (!m) continue;
      m.leadCount += 1;
      if (l.status === 'converted') m.convertedCount += 1;
      for (const d of l.contact?.deals ?? []) {
        if (d.stage === 'won') m.won += toRupees(d.valuePaise);
        else if (d.stage !== 'lost') m.pipeline += toRupees(d.valuePaise);
      }
    }
  }

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      budget: toRupees(c.budgetPaise),
      spend: c.spendPaise != null ? toRupees(c.spendPaise) : null,
      status: c.status,
      startDate: c.startDate.toISOString(),
      ...(withMetrics ? { metrics: metricsById.get(c.id) } : {}),
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(2),
  channel: z.enum(['online', 'offline']),
  budget: z.number().min(0),
});

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'manage_campaigns')) {
    return forbidden('Your role cannot manage campaigns');
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.res;
  const campaign = await prisma.campaign.create({
    data: {
      name: body.data.name,
      channel: body.data.channel,
      budgetPaise: toPaise(body.data.budget),
      startDate: new Date(),
    },
  });
  await prisma.auditEvent.create({
    data: {
      type: 'campaign_created',
      message: `Campaign launched: ${campaign.name}`,
      actorId: ctx.actor.id,
      entity: `campaign:${campaign.id}`,
    },
  });
  return NextResponse.json({ id: campaign.id }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string(),
  budget: z.number().min(0).optional(),
  spend: z.number().min(0).nullable().optional(),
  status: z.enum(['active', 'completed']).optional(),
});

export async function PATCH(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'manage_campaigns')) {
    return forbidden('Your role cannot manage campaigns');
  }
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.res;
  const input = body.data;
  await prisma.campaign.update({
    where: { id: input.id },
    data: {
      ...(input.budget != null ? { budgetPaise: toPaise(input.budget) } : {}),
      ...(input.spend !== undefined
        ? { spendPaise: input.spend != null ? toPaise(input.spend) : null }
        : {}),
      ...(input.status != null ? { status: input.status } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
