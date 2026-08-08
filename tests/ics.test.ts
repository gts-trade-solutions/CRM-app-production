import { describe, expect, it } from 'vitest';
import { buildCalendar, type IcsEvent } from '@/lib/server/ics';

const base: IcsEvent = {
  uid: 'activity-abc@sales-force-crm',
  start: new Date('2026-08-10T09:30:00.000Z'),
  end: new Date('2026-08-10T10:00:00.000Z'),
  summary: 'Call Rohit',
};

/** Unfold continuation lines the way a calendar client does. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('buildCalendar', () => {
  it('wraps events in a VCALENDAR with CRLF line endings', () => {
    const ics = buildCalendar([base], { name: 'My tasks' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    // Every break is CRLF — a bare LF makes Outlook reject the file.
    expect(ics.split('\n').every((l, i, all) => i === all.length - 1 || l.endsWith('\r'))).toBe(true);
  });

  it('writes UTC timestamps without punctuation', () => {
    const ics = buildCalendar([base], { name: 'x' });
    expect(ics).toContain('DTSTART:20260810T093000Z');
    expect(ics).toContain('DTEND:20260810T100000Z');
  });

  it('keeps the uid stable so clients update instead of duplicating', () => {
    const a = buildCalendar([base], { name: 'x' });
    const b = buildCalendar([base], { name: 'x' });
    expect(a).toContain(`UID:${base.uid}`);
    expect(b).toContain(`UID:${base.uid}`);
  });

  it('escapes commas, semicolons and newlines in text values', () => {
    const ics = unfold(
      buildCalendar(
        [{ ...base, summary: 'Call Rohit, Priya; then note', description: 'a\nb' }],
        { name: 'x' },
      ),
    );
    expect(ics).toContain('SUMMARY:Call Rohit\\, Priya\\; then note');
    expect(ics).toContain('DESCRIPTION:a\\nb');
  });

  it('folds long lines at 75 octets and they unfold to the original', () => {
    const summary = 'A'.repeat(200);
    const ics = buildCalendar([{ ...base, summary }], { name: 'x' });
    const longest = Math.max(
      ...ics.split('\r\n').map((l) => Buffer.from(l, 'utf8').length),
    );
    expect(longest).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`SUMMARY:${summary}`);
  });

  it('never splits a multi-byte character across a fold', () => {
    // '•' is three bytes; a naive character-count fold cuts it in half.
    const ics = buildCalendar(
      [{ ...base, description: '• Rohit Malhotra '.repeat(12) }],
      { name: 'x' },
    );
    for (const line of ics.split('\r\n')) {
      // A byte-boundary error surfaces as U+FFFD on the round trip.
      expect(line).not.toContain('�');
    }
    expect(unfold(ics)).toContain('• Rohit Malhotra');
  });

  it('adds a reminder alarm only for open events', () => {
    const open = buildCalendar([{ ...base, reminderMinutes: 30 }], { name: 'x' });
    expect(open).toContain('TRIGGER:-PT30M');
    const done = buildCalendar(
      [{ ...base, reminderMinutes: 30, cancelled: true }],
      { name: 'x' },
    );
    expect(done).not.toContain('BEGIN:VALARM');
    expect(done).toContain('STATUS:CANCELLED');
  });

  it('publishes a refresh interval so subscribers re-poll', () => {
    const ics = buildCalendar([base], { name: 'x', refreshMinutes: 30 });
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT30M');
    expect(ics).toContain('X-PUBLISHED-TTL:PT30M');
  });
});
