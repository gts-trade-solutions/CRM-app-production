import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { requireUser } from '@/lib/server/auth';
import { unauthenticated } from '@/lib/server/api';
import { toRupees } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** Campaign list — attribution dropdowns and the campaigns page shell. */
export async function GET(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) return unauthenticated();
  const rows = await prisma.campaign.findMany({
    orderBy: { startDate: 'desc' },
  });
  return NextResponse.json({
    campaigns: rows.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      budget: toRupees(c.budgetPaise),
      spend: c.spendPaise != null ? toRupees(c.spendPaise) : null,
      status: c.status,
      startDate: c.startDate.toISOString(),
    })),
  });
}
