// Organisation + pipeline-stage settings — read by quotation, kanban,
// forecast and stage labels app-wide. Admin mutation endpoints come with
// the admin-console migration.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
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

const patchSchema = z.object({
  org: z
    .object({
      companyName: z.string().min(2),
      addressLine: z.string(),
      gstin: z.string(),
      quoteValidityDays: z.number().int().min(1),
      gstRate: z.number().min(0).max(1),
      quoteTerms: z.array(z.string()),
    })
    .optional(),
  stages: z
    .record(
      z.enum(['qualification', 'proposal', 'negotiation', 'won', 'lost']),
      z.object({
        label: z.string().min(1),
        weight: z.number().min(0).max(1),
      }),
    )
    .optional(),
});

export async function PATCH(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  if (input.org) {
    if (!hasCapability(ctx.actor.role, 'manage_org')) {
      return forbidden('Your role cannot edit organisation settings');
    }
    await prisma.orgSettings.update({
      where: { id: 1 },
      data: {
        companyName: input.org.companyName,
        addressLine: input.org.addressLine,
        gstin: input.org.gstin,
        quoteValidityDays: input.org.quoteValidityDays,
        gstRateBps: Math.round(input.org.gstRate * 10000),
        quoteTermsJson: JSON.stringify(input.org.quoteTerms),
      },
    });
  }
  if (input.stages) {
    if (!hasCapability(ctx.actor.role, 'manage_pipeline')) {
      return forbidden('Your role cannot edit pipeline settings');
    }
    for (const [stage, setting] of Object.entries(input.stages)) {
      await prisma.stageSetting.update({
        where: { stage: stage as 'qualification' | 'proposal' | 'negotiation' | 'won' | 'lost' },
        data: {
          label: setting.label,
          weightBps: Math.round(setting.weight * 10000),
        },
      });
    }
  }
  return NextResponse.json({ ok: true });
}
