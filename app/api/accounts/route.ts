import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toRupees } from '@/lib/server/db';
import {
  actorContext,
  forbidden,
  pagination,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { serializeAccount } from '@/lib/server/serialize';

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
            { industry: { contains: q } },
            { city: { contains: q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.account.count({ where }),
    prisma.account.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take,
      include: {
        owner: { select: { id: true, name: true } },
        contacts: {
          where: { archived: false },
          select: {
            id: true,
            deals: {
              where: { archived: false },
              select: { stage: true, valuePaise: true },
            },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    page,
    pageSize,
    total,
    accounts: rows.map((a) => {
      const deals = a.contacts.flatMap((c) => c.deals);
      return {
        ...serializeAccount(a),
        contactCount: a.contacts.length,
        openValue: toRupees(
          deals
            .filter((d) => d.stage !== 'won' && d.stage !== 'lost')
            .reduce((s, d) => s + d.valuePaise, BigInt(0)),
        ),
        securedValue: toRupees(
          deals
            .filter((d) => d.stage === 'won')
            .reduce((s, d) => s + d.valuePaise, BigInt(0)),
        ),
      };
    }),
  });
}

const createSchema = z.object({
  name: z.string().min(2),
  industry: z.string().default(''),
  city: z.string().default(''),
  website: z.string().default(''),
  ownerId: z.string().optional(),
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

  const account = await prisma.account.create({
    data: { ...input, ownerId },
  });
  await prisma.auditEvent.create({
    data: {
      type: 'account_created',
      message: `Account added: ${account.name}`,
      actorId: ctx.actor.id,
      entity: `account:${account.id}`,
    },
  });
  return NextResponse.json({ id: account.id }, { status: 201 });
}
