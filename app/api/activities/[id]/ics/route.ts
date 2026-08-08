// Single-event download — the "Add to calendar" button on one task.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { activityToEvent } from '@/lib/server/activities';
import { buildCalendar } from '@/lib/server/ics';
import { actorContext, badRequest, notFound, unauthenticated } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const activity = await prisma.salesActivity.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible } },
    include: { targets: { orderBy: { createdAt: 'asc' } } },
  });
  if (!activity) return notFound();

  const baseUrl = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const refs = activity.targets.length
    ? activity.targets
    : [{ relatedType: activity.relatedType, relatedId: activity.relatedId }];
  const [leads, deals, contacts] = await Promise.all([
    prisma.lead.findMany({
      where: {
        id: { in: refs.filter((r) => r.relatedType === 'lead').map((r) => r.relatedId) },
      },
      select: { id: true, name: true, company: true },
    }),
    prisma.deal.findMany({
      where: {
        id: { in: refs.filter((r) => r.relatedType === 'deal').map((r) => r.relatedId) },
      },
      select: { id: true, title: true },
    }),
    prisma.contact.findMany({
      where: {
        id: { in: refs.filter((r) => r.relatedType === 'contact').map((r) => r.relatedId) },
      },
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

  const event = activityToEvent(activity, {
    baseUrl,
    relatedNames: refs.map((r) => nameFor(r.relatedType, r.relatedId)),
  });
  // Undated activities are to-dos, not appointments — there is no time to put
  // on a calendar, so this is a client error rather than an empty file.
  if (!event) return badRequest('This activity has no due date to schedule');

  const filename = `${activity.subject.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'task'}.ics`;
  return new NextResponse(buildCalendar([event], { name: activity.subject }), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
