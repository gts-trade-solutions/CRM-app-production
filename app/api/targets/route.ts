import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toPaise } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  userId: z.string(),
  amount: z.number().min(0),
});

export async function PUT(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'set_targets')) {
    return forbidden('Your role cannot set targets');
  }
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;

  await prisma.target.upsert({
    where: { userId: body.data.userId },
    create: {
      userId: body.data.userId,
      monthlyPaise: toPaise(body.data.amount),
    },
    update: { monthlyPaise: toPaise(body.data.amount) },
  });
  return NextResponse.json({ ok: true });
}
