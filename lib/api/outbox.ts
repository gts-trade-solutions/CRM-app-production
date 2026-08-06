// Offline lead outbox: durable localStorage queue with idempotency keys.
// Leads captured offline POST on reconnect; the server dedupes replays by
// key, so a flush interrupted mid-way can safely run again.

import { uid } from '@/lib/utils';
import type { LeadAttachment, LeadSource } from '@/lib/types';

export interface CreateLeadInput {
  name: string;
  company: string;
  phone: string;
  email: string;
  source: LeadSource;
  ownerId?: string;
  estimatedValue: number;
  notes: string;
  campaignId?: string;
  attachments?: Pick<LeadAttachment, 'name' | 'size' | 'type' | 'dataUrl'>[];
}

const OUTBOX_KEY = 'sf-lead-outbox-v1';

interface OutboxEntry extends CreateLeadInput {
  idempotencyKey: string;
  queuedAt: string;
}

function read(): OutboxEntry[] {
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: OutboxEntry[]) {
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
}

export function enqueueOfflineLead(input: CreateLeadInput) {
  const entries = read();
  entries.push({
    ...input,
    // Large previews stay out of the queue to protect the storage quota.
    attachments: input.attachments?.map((a) => ({ ...a, dataUrl: undefined })),
    idempotencyKey: uid('off'),
    queuedAt: new Date().toISOString(),
  });
  write(entries);
}

export function outboxCount(): number {
  if (typeof window === 'undefined') return 0;
  return read().length;
}

/** POSTs every queued lead; removes entries that succeed. Returns count synced. */
export async function flushOutbox(): Promise<number> {
  const entries = read();
  if (entries.length === 0) return 0;
  const remaining: OutboxEntry[] = [];
  let flushed = 0;
  for (const entry of entries) {
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, capturedOffline: true }),
      });
      if (res.ok) {
        flushed++;
      } else if (res.status >= 400 && res.status < 500) {
        // Invalid/unauthorized entries won't succeed on retry — drop.
        flushed += 0;
      } else {
        remaining.push(entry);
      }
    } catch {
      remaining.push(entry); // still offline / server unreachable
    }
  }
  write(remaining);
  return flushed;
}
