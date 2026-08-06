// Report aggregates with period filtering — leaderboard, channel trend,
// source performance, lost reasons. Forecast stays client-side over the
// live deals list.

import { NextRequest, NextResponse } from 'next/server';
import { prisma, toRupees } from '@/lib/server/db';
import { actorContext, unauthenticated } from '@/lib/server/api';
import { SOURCE_CONFIG, LeadSource } from '@/lib/types';

export const dynamic = 'force-dynamic';

function periodStart(period: string, now: Date): Date | null {
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), q, 1);
  }
  if (period === '6m') return new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return null;
}

export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const period = new URL(req.url).searchParams.get('period') ?? 'all';
  const now = new Date();
  const cutoff = periodStart(period, now);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const scope = { ownerId: { in: ctx.visible } };
  const closedFilter = cutoff ? { closedAt: { gte: cutoff } } : {};
  const leadFilter = cutoff ? { createdAt: { gte: cutoff } } : {};

  const [wonByOwner, users, leads, lostDeals, trendLeads] = await Promise.all([
    prisma.deal.groupBy({
      by: ['ownerId'],
      where: { ...scope, archived: false, stage: 'won', ...closedFilter },
      _sum: { valuePaise: true },
    }),
    prisma.user.findMany({
      where: { id: { in: ctx.visible } },
      select: { id: true, name: true },
    }),
    prisma.lead.findMany({
      where: { ...scope, ...leadFilter },
      select: { source: true, status: true },
    }),
    prisma.deal.findMany({
      where: { ...scope, archived: false, stage: 'lost', ...closedFilter },
      select: { lostReason: true },
    }),
    prisma.lead.findMany({
      where: { ...scope, createdAt: { gte: sixMonthsAgo } },
      select: { source: true, createdAt: true },
    }),
  ]);

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? '—';

  const leaderboard = wonByOwner
    .map((r) => ({
      name: nameOf(r.ownerId),
      value: toRupees(r._sum.valuePaise ?? BigInt(0)),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Channel trend: monthly online/offline, last 6 months (period-agnostic).
  const months: { key: string; name: string; online: number; offline: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      name: d.toLocaleString('en', { month: 'short' }),
      online: 0,
      offline: 0,
    });
  }
  for (const l of trendLeads) {
    const key = `${l.createdAt.getFullYear()}-${l.createdAt.getMonth()}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket[SOURCE_CONFIG[l.source].channel] += 1;
  }

  // Source performance.
  const sourceMap = new Map<LeadSource, { leads: number; converted: number }>();
  for (const l of leads) {
    const r = sourceMap.get(l.source) ?? { leads: 0, converted: 0 };
    r.leads += 1;
    if (l.status === 'converted') r.converted += 1;
    sourceMap.set(l.source, r);
  }
  const sourceRows = Array.from(sourceMap.entries())
    .map(([source, r]) => ({
      source,
      label: SOURCE_CONFIG[source].label,
      channel: SOURCE_CONFIG[source].channel,
      leads: r.leads,
      converted: r.converted,
      rate: r.leads ? Math.round((r.converted / r.leads) * 100) : 0,
    }))
    .sort((a, b) => b.leads - a.leads);

  // Lost reasons.
  const reasonMap = new Map<string, number>();
  for (const d of lostDeals) {
    const reason = d.lostReason?.trim() || 'No reason recorded';
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
  }
  const lostRows = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    leaderboard,
    channelTrend: months.map(({ name, online, offline }) => ({
      name,
      online,
      offline,
    })),
    sourceRows,
    lostReasons: {
      total: lostRows.reduce((s, r) => s + r.count, 0),
      rows: lostRows,
    },
  });
}
