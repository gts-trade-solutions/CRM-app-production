// Outbound email: sends via SES when configured, and always logs a
// completed email activity on the record's timeline. Falls back to
// log-only when SES isn't set up.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { sendEmail, sesEnabled } from '@/lib/server/email';
import {
  actorContext,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().max(10_000).default(''),
  relatedType: z.enum(['lead', 'deal', 'contact']),
  relatedId: z.string(),
});

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  const input = parsed.data;

  let sent = false;
  if (sesEnabled()) {
    try {
      await sendEmail(input.to, input.subject, input.body);
      sent = true;
    } catch (e) {
      return NextResponse.json(
        { error: `Email send failed: ${(e as Error).message}` },
        { status: 502 },
      );
    }
  }

  await prisma.salesActivity.create({
    data: {
      kind: 'email',
      subject: `Email: ${input.subject}`,
      notes: `${sent ? 'Sent to' : 'Logged for'} ${input.to}${input.body ? ` — ${input.body.slice(0, 500)}` : ''}`,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      ownerId: ctx.actor.id,
      createdById: ctx.actor.id,
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ sent });
}
