// Live duplicate check for the capture form: does this phone/email already
// exist on any lead or contact? Checked org-wide (a duplicate in another
// team is still a duplicate) but reveals only the record kind, name and
// owner name.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { requireUser } from '@/lib/server/auth';
import { unauthenticated } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) return unauthenticated();
  const { searchParams } = new URL(req.url);
  const phoneDigits = (searchParams.get('phone') ?? '').replace(/\D/g, '');
  const email = (searchParams.get('email') ?? '').trim().toLowerCase();
  if (phoneDigits.length < 6 && !email) {
    return NextResponse.json({ match: null });
  }

  // Phone columns store formatted numbers (spaces between groups), so SQL
  // narrows on the last 4 digits — short enough to sit inside the final
  // group — and the exact digit comparison happens in JS below.
  const phoneTail = phoneDigits.slice(-4);
  const [leads, contacts] = await Promise.all([
    prisma.lead.findMany({
      where: {
        OR: [
          ...(phoneTail ? [{ phone: { contains: phoneTail } }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      take: 20,
      include: { owner: { select: { name: true } } },
    }),
    prisma.contact.findMany({
      where: {
        archived: false,
        OR: [
          ...(phoneTail ? [{ phone: { contains: phoneTail } }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      take: 20,
      include: { owner: { select: { name: true } } },
    }),
  ]);

  const hit =
    leads.find(
      (l) =>
        (phoneDigits.length >= 6 &&
          l.phone.replace(/\D/g, '') === phoneDigits) ||
        (email !== '' && l.email.toLowerCase() === email),
    ) ??
    contacts.find(
      (c) =>
        (phoneDigits.length >= 6 &&
          c.phone.replace(/\D/g, '') === phoneDigits) ||
        (email !== '' && c.email.toLowerCase() === email),
    );

  if (!hit) return NextResponse.json({ match: null });
  const kind = 'status' in hit ? 'lead' : 'contact';
  return NextResponse.json({
    match: { kind, name: hit.name, ownerName: hit.owner.name },
  });
}
