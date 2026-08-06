// Dashboard aggregates — computed in the database over the actor's scope.

import { NextRequest, NextResponse } from 'next/server';
import { prisma, toRupees } from '@/lib/server/db';
import { actorContext, unauthenticated } from '@/lib/server/api';
import { SOURCE_CONFIG, LeadSource } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const scope = { ownerId: { in: ctx.visible } };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    leadsBySource,
    convertedCount,
    totalLeads,
    openDeals,
    wonAgg,
    monthWonAgg,
    target,
    stageAgg,
    wonDeals6m,
    recentAudit,
  ] = await Promise.all([
    prisma.lead.groupBy({ by: ['source'], where: scope, _count: { _all: true } }),
    prisma.lead.count({ where: { ...scope, status: 'converted' } }),
    prisma.lead.count({ where: scope }),
    prisma.deal.findMany({
      where: {
        ...scope,
        archived: false,
        stage: { in: ['qualification', 'proposal', 'negotiation'] },
      },
      select: { stage: true, valuePaise: true },
    }),
    prisma.deal.aggregate({
      where: { ...scope, archived: false, stage: 'won' },
      _sum: { valuePaise: true },
      _count: { _all: true },
    }),
    prisma.deal.aggregate({
      where: {
        ...scope,
        archived: false,
        stage: 'won',
        closedAt: { gte: monthStart },
      },
      _sum: { valuePaise: true },
    }),
    prisma.target.findUnique({ where: { userId: ctx.actor.id } }),
    prisma.stageSetting.findMany(),
    prisma.deal.findMany({
      where: {
        ...scope,
        archived: false,
        stage: 'won',
        closedAt: { gte: sixMonthsAgo },
      },
      select: { closedAt: true, valuePaise: true },
    }),
    prisma.auditEvent.findMany({
      where: { OR: [{ actorId: { in: ctx.visible } }, { actorId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const onlineSources = (Object.keys(SOURCE_CONFIG) as LeadSource[]).filter(
    (s) => SOURCE_CONFIG[s].channel === 'online',
  );
  const online = leadsBySource
    .filter((r) => onlineSources.includes(r.source))
    .reduce((s, r) => s + r._count._all, 0);

  // Revenue per month, last 6 months.
  const months: { key: string; name: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      name: d.toLocaleString('en', { month: 'short' }),
      value: 0,
    });
  }
  for (const deal of wonDeals6m) {
    if (!deal.closedAt) continue;
    const key = `${deal.closedAt.getFullYear()}-${deal.closedAt.getMonth()}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.value += toRupees(deal.valuePaise);
  }

  const stageLabel = (s: string) =>
    stageAgg.find((x) => x.stage === s)?.label ?? s;
  const stageData = (['qualification', 'proposal', 'negotiation'] as const).map(
    (stage) => ({
      name: stageLabel(stage),
      value: toRupees(
        openDeals
          .filter((d) => d.stage === stage)
          .reduce((s, d) => s + d.valuePaise, BigInt(0)),
      ),
    }),
  );

  return NextResponse.json({
    leads: {
      total: totalLeads,
      online,
      offline: totalLeads - online,
      converted: convertedCount,
    },
    pipeline: {
      openValue: toRupees(
        openDeals.reduce((s, d) => s + d.valuePaise, BigInt(0)),
      ),
      openCount: openDeals.length,
      securedValue: toRupees(wonAgg._sum.valuePaise ?? BigInt(0)),
      securedCount: wonAgg._count._all,
    },
    monthTarget: {
      target: target ? toRupees(target.monthlyPaise) : 0,
      secured: toRupees(monthWonAgg._sum.valuePaise ?? BigInt(0)),
    },
    sourceData: leadsBySource
      .map((r) => ({
        name: SOURCE_CONFIG[r.source].label,
        channel: SOURCE_CONFIG[r.source].channel,
        count: r._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    revenueByMonth: months.map(({ name, value }) => ({ name, value })),
    stageData,
    recent: recentAudit.map((a) => ({
      id: a.id,
      message: a.message,
      userName: a.actor?.name ?? 'System',
      at: a.createdAt.toISOString(),
    })),
  });
}
