import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import {
  actorContext,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { convertLead } from '@/lib/server/convert';

export const dynamic = 'force-dynamic';

const convertSchema = z.object({
  dealTitle: z.string().min(2),
  value: z.number().min(0),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible } },
  });
  if (!lead) return notFound();

  const body = await parseBody(req, convertSchema);
  if (!body.ok) return body.res;

  try {
    const result = await convertLead(
      ctx.actor.id,
      lead.id,
      body.data.dealTitle,
      body.data.value,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 409 },
    );
  }
}
