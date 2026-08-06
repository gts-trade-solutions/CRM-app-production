import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import {
  actorContext,
  forbidden,
  pagination,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { serializeContact } from '@/lib/server/serialize';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const { page, pageSize, skip, take } = pagination(req);

  const where = {
    ownerId: { in: ctx.visible },
    archived: false,
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { company: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        owner: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    }),
  ]);
  return NextResponse.json({
    page,
    pageSize,
    total,
    contacts: rows.map(serializeContact),
  });
}

const createSchema = z.object({
  name: z.string().min(2),
  company: z.string().default(''),
  title: z.string().default(''),
  phone: z.string().min(6),
  email: z.string().email().or(z.literal('')).default(''),
  ownerId: z.string().optional(),
  accountId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  const ownerId = input.ownerId ?? ctx.actor.id;
  if (!ctx.visible.includes(ownerId)) {
    return forbidden('Owner is outside your scope');
  }

  const contact = await prisma.contact.create({
    data: {
      name: input.name,
      company: input.company,
      title: input.title,
      phone: input.phone,
      email: input.email,
      ownerId,
      accountId: input.accountId ?? null,
    },
  });
  await prisma.auditEvent.create({
    data: {
      type: 'contact_created',
      message: `Contact added: ${contact.name}`,
      actorId: ctx.actor.id,
      entity: `contact:${contact.id}`,
    },
  });
  return NextResponse.json({ id: contact.id }, { status: 201 });
}
