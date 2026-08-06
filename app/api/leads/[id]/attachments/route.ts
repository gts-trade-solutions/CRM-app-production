import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { deleteAttachment, storeAttachment } from '@/lib/server/storage';
import {
  actorContext,
  notFound,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  attachments: z
    .array(
      z.object({
        name: z.string(),
        size: z.number().int().min(0),
        type: z.string(),
        dataUrl: z.string().optional(),
      }),
    )
    .min(1)
    .max(10),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible } },
  });
  if (!lead) return notFound();

  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;

  for (const a of body.data.attachments) {
    const stored = await storeAttachment(a);
    await prisma.leadAttachment.create({
      data: {
        leadId: lead.id,
        name: a.name,
        size: a.size,
        mimeType: a.type,
        dataUrl: stored.dataUrl,
        s3Key: stored.s3Key,
        uploaderId: ctx.actor.id,
      },
    });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

const deleteSchema = z.object({ attachmentId: z.string() });

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, ownerId: { in: ctx.visible } },
  });
  if (!lead) return notFound();
  const body = await parseBody(req, deleteSchema);
  if (!body.ok) return body.res;
  const attachment = await prisma.leadAttachment.findFirst({
    where: { id: body.data.attachmentId, leadId: lead.id },
  });
  if (attachment?.s3Key) {
    try {
      await deleteAttachment(attachment.s3Key);
    } catch {
      // best-effort — the DB row is the source of truth
    }
  }
  await prisma.leadAttachment.deleteMany({
    where: { id: body.data.attachmentId, leadId: lead.id },
  });
  return NextResponse.json({ ok: true });
}
