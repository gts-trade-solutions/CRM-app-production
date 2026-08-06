import { NextRequest, NextResponse } from 'next/server';
import { prisma, toRupees } from '@/lib/server/db';
import { requireUser } from '@/lib/server/auth';
import { unauthenticated } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

/** Active catalogue for deal line items (admin CRUD comes later). */
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
