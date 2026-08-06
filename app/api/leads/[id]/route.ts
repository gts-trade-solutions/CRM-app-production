import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toPaise } from '@/lib/server/db';
import {
  actorContext,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';
import { serializeLead } from '@/lib/server/serialize';
import { attachmentUrl } from '@/lib/server/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible } },
    include: {
      owner: { select: { id: true, name: true } },
      attachments: true,
      contact: { select: { id: true } },
    },
  });
  if (!lead) return notFound();
  const attachments = await Promise.all(
    lead.attachments.map(async (a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      type: a.mimeType,
      dataUrl: a.dataUrl,
      // Presigned S3 URL when stored remotely; inline preview otherwise.
      url: a.s3Key ? await attachmentUrl(a.s3Key) : a.dataUrl,
      uploadedAt: a.uploadedAt.toISOString(),
    })),
  );
  return NextResponse.json({
    lead: {
      ...serializeLead(lead),
      contactId: lead.contact?.id ?? null,
      attachments,
    },
  });
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  company: z.string().optional(),
  phone: z.string().min(6).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  estimatedValue: z.number().min(0).optional(),
  notes: z.string().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'disqualified']).optional(),
  ownerId: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const existing = await prisma.lead.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible } },
  });
  if (!existing) return notFound();

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.res;
  const input = body.data;

  if (input.ownerId && !ctx.visible.includes(input.ownerId)) {
    return NextResponse.json(
      { error: 'Owner is outside your scope' },
      { status: 403 },
    );
  }

  const lead = await prisma.lead.update({
    where: { id: existing.id },
    data: {
      ...(input.name != null ? { name: input.name } : {}),
      ...(input.company != null ? { company: input.company } : {}),
      ...(input.phone != null ? { phone: input.phone } : {}),
      ...(input.email != null ? { email: input.email } : {}),
      ...(input.notes != null ? { notes: input.notes } : {}),
      ...(input.status != null ? { status: input.status } : {}),
      ...(input.ownerId != null ? { ownerId: input.ownerId } : {}),
      ...(input.estimatedValue != null
        ? { estimatedPaise: toPaise(input.estimatedValue) }
        : {}),
    },
  });

  if (input.status) {
    await prisma.auditEvent.create({
      data: {
        type: 'lead_status',
        message: `${lead.name} marked ${input.status}`,
        actorId: ctx.actor.id,
        entity: `lead:${lead.id}`,
      },
    });
  }

  return NextResponse.json({ lead: serializeLead(lead) });
}
