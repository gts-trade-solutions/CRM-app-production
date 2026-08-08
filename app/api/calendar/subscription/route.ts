// Issue and rotate the caller's own calendar-subscription URL.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { requireUser } from '@/lib/server/auth';
import { unauthenticated } from '@/lib/server/api';
import { ensureCalendarToken, newCalendarToken } from '@/lib/server/activities';

export const dynamic = 'force-dynamic';

function urlsFor(req: NextRequest, token: string) {
  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const httpUrl = `${origin}/api/calendar/${token}`;
  return {
    url: httpUrl,
    // webcal:// makes the OS hand the link to the calendar app as a
    // subscription rather than to the browser as a one-off download.
    webcalUrl: httpUrl.replace(/^https?:/, 'webcal:'),
  };
}

export async function GET(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) return unauthenticated();
  const token = await ensureCalendarToken(actor.id);
  return NextResponse.json(urlsFor(req, token));
}

/** Rotate — invalidates every calendar already subscribed to the old URL. */
export async function POST(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) return unauthenticated();
  const token = newCalendarToken();
  await prisma.user.update({
    where: { id: actor.id },
    data: { calendarToken: token },
  });
  await prisma.auditEvent.create({
    data: {
      type: 'calendar_token_rotated',
      message: `${actor.name} reset their calendar subscription link`,
      actorId: actor.id,
      entity: `user:${actor.id}`,
    },
  });
  return NextResponse.json(urlsFor(req, token));
}
