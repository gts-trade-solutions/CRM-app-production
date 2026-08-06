// Global search across leads, contacts, accounts and deals — scoped to the
// actor's hierarchy slice, capped per entity.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { actorContext, unauthenticated } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  const [leads, contacts, accounts, deals] = await Promise.all([
    prisma.lead.findMany({
      where: {
        ownerId: { in: ctx.visible },
        OR: [
          { name: { contains: q } },
          { company: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
        ],
      },
      take: 5,
      select: { id: true, name: true, company: true, email: true, status: true },
    }),
    prisma.contact.findMany({
      where: {
        ownerId: { in: ctx.visible },
        archived: false,
        OR: [
          { name: { contains: q } },
          { company: { contains: q } },
          { email: { contains: q } },
        ],
      },
      take: 5,
      select: { id: true, name: true, company: true, email: true },
    }),
    prisma.account.findMany({
      where: {
        ownerId: { in: ctx.visible },
        archived: false,
        OR: [
          { name: { contains: q } },
          { industry: { contains: q } },
          { city: { contains: q } },
        ],
      },
      take: 5,
      select: { id: true, name: true, industry: true, city: true },
    }),
    prisma.deal.findMany({
      where: {
        ownerId: { in: ctx.visible },
        archived: false,
        title: { contains: q },
      },
      take: 5,
      select: { id: true, title: true, stage: true },
    }),
  ]);

  const stageSettings = await prisma.stageSetting.findMany();
  const stageLabel = (s: string) =>
    stageSettings.find((x) => x.stage === s)?.label ?? s;

  return NextResponse.json({
    results: [
      ...leads.map((l) => ({
        type: 'lead',
        id: l.id,
        title: l.name,
        subtitle: `Lead · ${l.company || l.email} · ${l.status}`,
        href: `/leads/${l.id}`,
      })),
      ...contacts.map((c) => ({
        type: 'contact',
        id: c.id,
        title: c.name,
        subtitle: `Contact · ${c.company || c.email}`,
        href: `/contacts/${c.id}`,
      })),
      ...accounts.map((a) => ({
        type: 'account',
        id: a.id,
        title: a.name,
        subtitle: `Account · ${[a.industry, a.city].filter(Boolean).join(' · ') || 'company'}`,
        href: `/accounts/${a.id}`,
      })),
      ...deals.map((d) => ({
        type: 'deal',
        id: d.id,
        title: d.title,
        subtitle: `Deal · ${stageLabel(d.stage)}`,
        href: `/pipeline/${d.id}`,
      })),
    ],
  });
}
