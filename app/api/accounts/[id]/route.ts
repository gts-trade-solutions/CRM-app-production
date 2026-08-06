import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import {
  serializeAccount,
  serializeContact,
  serializeDeal,
} from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const account = await prisma.account.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible }, archived: false },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: {
        where: { archived: false },
        include: {
          deals: {
            where: { archived: false },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });
  if (!account) return notFound();

  return NextResponse.json({
    account: serializeAccount(account),
    contacts: account.contacts.map((c) => serializeContact(c)),
    deals: account.contacts
      .flatMap((c) => c.deals)
      .map((d) => serializeDeal(d)),
  });
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  industry: z.string().optional(),
  city: z.string().optional(),
  website: z.string().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const existing = await prisma.account.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible } },
  });
  if (!existing) return notFound();

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  if (
    input.archived === true &&
    !hasCapability(ctx.actor.role, 'archive_records')
  ) {
    return forbidden('Your role cannot archive records');
  }

  const account = await prisma.account.update({
    where: { id: existing.id },
    data: input,
  });
  return NextResponse.json({ account: serializeAccount(account) });
}
