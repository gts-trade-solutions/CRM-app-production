// iCalendar (RFC 5545) generation — the format every phone and desktop
// calendar already understands. Two uses: a per-task download, and a
// subscription feed the calendar app re-fetches on its own schedule, which is
// what makes tasks appear "automatically" without any OAuth handshake.

export interface IcsEvent {
  /** Stable across regenerations — the calendar updates rather than duplicates. */
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  url?: string;
  location?: string;
  /** Adds a VALARM this many minutes before the start. Omit for no reminder. */
  reminderMinutes?: number;
  cancelled?: boolean;
}

/** RFC 5545 §3.3.5 — UTC date-time, no punctuation. */
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 §3.3.11 — backslash, semicolon, comma and newlines are special. */
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 — content lines are folded at 75 octets. Folding counts bytes,
 * not characters, so a multi-byte character must never be split across the
 * boundary (Outlook renders mojibake if it is).
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Walk back off a continuation byte so we cut on a character boundary.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    out.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return out.join('\r\n ');
}

function eventLines(e: IcsEvent): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.summary)}`,
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    // Bumped on every regeneration so clients accept the newer copy.
    `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.url) lines.push(`URL:${esc(e.url)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.reminderMinutes != null && !e.cancelled) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(e.summary)}`,
      `TRIGGER:-PT${e.reminderMinutes}M`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT');
  return lines;
}

/**
 * @param refreshMinutes hint for how often a subscribed client should re-fetch.
 *   Clients treat it as advisory — most poll somewhere between 15 min and a few
 *   hours regardless.
 */
export function buildCalendar(
  events: IcsEvent[],
  { name, refreshMinutes }: { name: string; refreshMinutes?: number },
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sales Force CRM//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    `NAME:${esc(name)}`,
  ];
  if (refreshMinutes) {
    lines.push(
      `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshMinutes}M`,
      `X-PUBLISHED-TTL:PT${refreshMinutes}M`,
    );
  }
  for (const e of events) lines.push(...eventLines(e));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
