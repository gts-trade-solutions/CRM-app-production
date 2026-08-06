// Organisation + pipeline-stage settings — read by quotation, kanban,
// forecast and stage labels app-wide. Admin mutation endpoints come with
// the admin-console migration.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { requireUser } from '@/lib/server/auth';
import { unauthenticated } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) return unauthenticated();

  const [org, stages] = await Promise.all([
    prisma.orgSettings.findUnique({ where: { id: 1 } }),
    prisma.stageSetting.findMany(),
  ]);

  return NextResponse.json({
    org: org
      ? {
          companyName: org.companyName,
          addressLine: org.addressLine,
          gstin: org.gstin,
          quoteValidityDays: org.quoteValidityDays,
          gstRate: org.gstRateBps / 10000,
          quoteTerms: JSON.parse(org.quoteTermsJson) as string[],
        }
      : null,
    stages: Object.fromEntries(
      stages.map((s) => [
        s.stage,
        { label: s.label, weight: s.weightBps / 10000 },
      ]),
    ),
  });
}
