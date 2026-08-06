// Bulk CSV import: server-side duplicate detection (normalized phone /
// lowercased email against leads AND contacts), everything owned by the
// importer. Returns added/skipped counts like the UI expects.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, toPaise } from '@/lib/server/db';
import {
  actorContext,
  parseBody,
  unauthenticated,
} from '@/lib/server/api';

export const dynamic = 'force-dynamic';

const rowSchema = z.object({
  name: z.string().min(1),
  company: z.string().default(''),
  phone: z.string().min(1),
  email: z.string().default(''),
  source: z.enum([
    'website',
    'social_media',
    'email_campaign',
    'marketplace',
    'walk_in',
    'phone',
    'field_visit',
    'event',
    'referral',
  ]),
  estimatedValue: z.number().min(0).default(0),
  notes: z.string().default(''),
});

const importSchema = z.object({ rows: z.array(rowSchema).max(2000) });

const norm = (p: string) => p.replace(/\D/g, '');

export async function POST(req: NextRequest) {
  const ctx = await actorContext(req);
  if (!ctx) return unauthenticated();
  const body = await parseBody(req, importSchema);
  if (!body.ok) return body.res;

  const [leads, contacts] = await Promise.all([
    prisma.lead.findMany({ select: { phone: true, email: true } }),
    prisma.contact.findMany({ select: { phone: true, email: true } }),
  ]);
  const knownPhones = new Set(
    [...leads, ...contacts].map((r) => norm(r.phone)).filter((p) => p.length >= 6),
  );
  const knownEmails = new Set(
    [...leads, ...contacts]
      .map((r) => r.email.trim().toLowerCase())
      .filter(Boolean),
  );

  let added = 0;
  let skipped = 0;
  for (const row of body.data.rows) {
    const phone = norm(row.phone);
    const email = row.email.trim().toLowerCase();
    const dupe =
      (phone.length >= 6 && knownPhones.has(phone)) ||
      (email !== '' && knownEmails.has(email));
    if (dupe) {
      skipped++;
      continue;
    }
    if (phone.length >= 6) knownPhones.add(phone);
    if (email) knownEmails.add(email);
    await prisma.lead.create({
      data: {
        name: row.name,
        company: row.company,
        phone: row.phone,
        email: row.email,
        source: row.source,
        ownerId: ctx.actor.id,
        estimatedPaise: toPaise(row.estimatedValue),
        notes: row.notes,
      },
    });
    added++;
  }

  if (added > 0) {
    await prisma.auditEvent.create({
      data: {
        type: 'lead_created',
        message: `${added} lead${added > 1 ? 's' : ''} imported from file`,
        actorId: ctx.actor.id,
      },
    });
  }
  return NextResponse.json({ added, skipped });
}
