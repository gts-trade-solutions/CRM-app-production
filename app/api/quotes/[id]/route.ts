import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import {
  actorContext,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { serializeQuote } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  status: z.enum(['draft', 'sent', 'accepted']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const quote = await prisma.quote.findFirst({
    where: { id: params.id, deal: { ownerId: { in: ctx.visible } } },
  });
  if (!quote) return notFound();

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.res;

  const updated = await prisma.quote.update({
    where: { id: quote.id },
    data: { status: body.data.status },
  });
  return NextResponse.json({ quote: serializeQuote(updated) });
}
