// Team view: the actor's manager chain, their visible subtree with
// per-member performance stats, and monthly targets.

import { NextRequest, NextResponse } from 'next/server';
import { prisma, toRupees } from '@/lib/server/db';
import { actorContext, unauthenticated } from '@/lib/server/api';
import { serializeUser } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [allUsers, leadCounts, deals, targets] = await Promise.all([
    prisma.user.findMany(),
    prisma.lead.groupBy({
      by: ['ownerId'],
      where: { ownerId: { in: ctx.visible } },
      _count: { _all: true },
    }),
    prisma.deal.findMany({
      where: { ownerId: { in: ctx.visible }, archived: false },
      select: { ownerId: true, stage: true, valuePaise: true, closedAt: true },
    }),
    prisma.target.findMany({ where: { userId: { in: ctx.visible } } }),
  ]);

  // Manager chain above the actor (nearest first).
  const byId = new Map(allUsers.map((u) => [u.id, u]));
  const chain: { id: string; name: string; role: string }[] = [];
  let cursor = ctx.actor.managerId ? byId.get(ctx.actor.managerId) : undefined;
  while (cursor) {
    chain.push({ id: cursor.id, name: cursor.name, role: cursor.role });
    cursor = cursor.managerId ? byId.get(cursor.managerId) : undefined;
  }

  const stats = new Map<
    string,
    { leads: number; openDeals: number; securedValue: number; securedMonth: number }
  >();
  for (const id of ctx.visible) {
    stats.set(id, { leads: 0, openDeals: 0, securedValue: 0, securedMonth: 0 });
  }
  for (const r of leadCounts) {
    const s = stats.get(r.ownerId);
    if (s) s.leads = r._count._all;
  }
  for (const d of deals) {
    const s = stats.get(d.ownerId);
    if (!s) continue;
    if (d.stage === 'won') {
      s.securedValue += toRupees(d.valuePaise);
      if (d.closedAt && d.closedAt >= monthStart) {
        s.securedMonth += toRupees(d.valuePaise);
      }
    } else if (d.stage !== 'lost') {
      s.openDeals += 1;
    }
  }

  return NextResponse.json({
    chain,
    users: allUsers
      .filter((u) => ctx.visible.includes(u.id))
      .map((u) => ({
        ...serializeUser(u),
        stats: stats.get(u.id),
      })),
    targets: Object.fromEntries(
      targets.map((t) => [t.userId, toRupees(t.monthlyPaise)]),
    ),
  });
}
