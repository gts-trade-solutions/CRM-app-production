import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toPaise, toRupees } from '@/lib/server/db';
import { requireUser } from '@/lib/server/auth';
import { hasCapability } from '@/lib/policy';
import {
  actorContext,
  forbidden,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) return unauthenticated();
  const rows = await prisma.product.findMany({
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({
    products: rows.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: toRupees(p.pricePaise),
      active: p.active,
    })),
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  sku: z.string().default(''),
  category: z.string().default(''),
  price: z.number().min(0),
  active: z.boolean().optional(),
});

/** Create or update a catalogue product (manage_products capability). */
export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  if (!hasCapability(ctx.actor.role, 'manage_products')) {
    return forbidden('Your role cannot manage the catalogue');
  }
  const body = await parseBody(req, upsertSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  const data = {
    name: input.name,
    sku: input.sku,
    category: input.category,
    pricePaise: toPaise(input.price),
    ...(input.active != null ? { active: input.active } : {}),
  };
  const product = input.id
    ? await prisma.product.update({ where: { id: input.id }, data })
    : await prisma.product.create({ data: { ...data, active: true } });
  return NextResponse.json({ id: product.id }, { status: input.id ? 200 : 201 });
}
