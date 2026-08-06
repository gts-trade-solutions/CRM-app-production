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
import { serializeContact, serializeDeal } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const contact = await prisma.contact.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible }, archived: false },
    include: {
      owner: { select: { id: true, name: true } },
      account: { select: { id: true, name: true } },
      deals: {
        where: { archived: false },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!contact) return notFound();
  return NextResponse.json({
    contact: serializeContact(contact),
    deals: contact.deals.map((d) => serializeDeal(d)),
  });
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().min(6).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  accountId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const existing = await prisma.contact.findFirst({
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

  const contact = await prisma.contact.update({
    where: { id: existing.id },
    data: {
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.company != null ? { company: input.company } : {}),
      ...(input.title != null ? { title: input.title } : {}),
      ...(input.phone != null ? { phone: input.phone } : {}),
      ...(input.email != null ? { email: input.email } : {}),
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.archived != null ? { archived: input.archived } : {}),
    },
  });
  return NextResponse.json({ contact: serializeContact(contact) });
}
