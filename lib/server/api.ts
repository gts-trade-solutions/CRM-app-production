// Shared plumbing for API route handlers: error responses, body parsing,
// pagination, and the standard actor + visibility preamble.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { requireUser } from './auth';
import { visibleUserIdsFor } from './rbac';

export function unauthenticated() {
  return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
}

export function forbidden(message = 'Not allowed') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function badRequest(issues: unknown) {
  return NextResponse.json(
    { error: 'Invalid input', issues },
    { status: 400 },
  );
}

/** Session actor + their visible-owner set, or null (route returns 401). */
export async function actorContext(
  req: NextRequest,
): Promise<{ actor: User; visible: string[] } | null> {
  const actor = await requireUser(req);
  if (!actor) return null;
  const visible = await visibleUserIdsFor(actor.id);
  return { actor, visible };
}

export async function parseBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: badRequest('Body must be JSON') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: badRequest(parsed.error.issues) };
  }
  return { ok: true, data: parsed.data };
}

export function pagination(req: NextRequest, defaultSize = 25) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(searchParams.get('pageSize')) || defaultSize),
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
