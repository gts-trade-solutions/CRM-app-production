// The subscription feed. Calendar clients cannot log in, so the token in the
// URL is the credential — it maps to exactly one user and yields only that
// user's own dated activities. Nothing else is reachable through it.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { activityToEvent } from '@/lib/server/activities';
import { buildCalendar } from '@/lib/server/ics';

export const dynamic = 'force-dynamic';

/** How far back finished work stays on the calendar. */
const HISTORY_DAYS = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  // Length check first so malformed URLs never reach the database.
  if (!/^[a-f0-9]{64}$/.test(params.token)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const user = await prisma.user.findUnique({
    where: { calendarToken: params.token },
    select: { id: true, name: true, active: true },
  });
  // A deactivated user's feed goes quiet rather than 404ing, so a revoked
  // account stops leaking new work without the client showing an error.
  if (!user) return new NextResponse('Not found', { status: 404 });

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const activities = user.active
    ? await prisma.salesActivity.findMany({
        where: { ownerId: user.id, dueAt: { gte: since } },
        orderBy: { dueAt: 'asc' },
        take: 500,
        include: { targets: { orderBy: { createdAt: 'asc' } } },
      })
    : [];

  // Resolve the record names that go in each event's description.
  const pairs = activities.flatMap((a) => [
    { type: a.relatedType, id: a.relatedId },
    ...a.targets.map((t) => ({ type: t.relatedType, id: t.relatedId })),
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

  const baseUrl = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const events = activities
    .map((a) =>
      activityToEvent(a, {
        baseUrl,
        relatedNames: a.targets.length
          ? a.targets.map((t) => nameFor(t.relatedType, t.relatedId))
          : [nameFor(a.relatedType, a.relatedId)],
      }),
    )
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const body = buildCalendar(events, {
    name: `Sales Force — ${user.name}`,
    refreshMinutes: 30,
  });

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="sales-force.ics"',
      // The feed is per-user and secret; no shared cache may keep a copy.
      'Cache-Control': 'private, no-store',
    },
  });
}
