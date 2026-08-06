// Server-Sent Events: pushes the unread notification count so the bell
// updates without user-driven polling. The client keeps a slow poll as a
// fallback for proxies that buffer SSE.

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

const INTERVAL_MS = 15_000;

export async function GET(req: NextRequest) {
  const actor = await requireUser(req);
  if (!actor) {
    return new Response('Unauthenticated', { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const unread = await prisma.notification.count({
            where: { userId: actor.id, read: false },
          });
          send({ unread, at: Date.now() });
        } catch {
          // transient DB error — next tick retries
        }
        if (!closed) setTimeout(tick, INTERVAL_MS);
      };

      req.signal.addEventListener('abort', () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      tick();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
