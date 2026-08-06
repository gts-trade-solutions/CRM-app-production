import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const users = await prisma.user.count();
    return NextResponse.json({ ok: true, db: 'up', users });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: 'down', error: (e as Error).message },
      { status: 503 },
    );
  }
}
