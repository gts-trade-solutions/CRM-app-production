'use client';

// Subscribe-once calendar link. The user adds this URL to Google, Apple or
// Outlook one time; from then on their calendar re-fetches it on its own and
// new or rescheduled tasks appear without anyone doing anything.

import { useState } from 'react';
import { CalendarCheck, Check, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCalendarSubscription,
  useRotateCalendarLink,
} from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function CalendarSubscribeCard() {
  const { data, isLoading } = useCalendarSubscription();
  const rotate = useRotateCalendarLink();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context; the URL stays selectable regardless.
      toast.error('Could not copy — select the link and copy it manually');
    }
  }

  if (isLoading || !data) return null;

  return (
    <Card>
      <CardContent className="p-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <CalendarCheck className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-medium">
            Put these tasks in your phone and desktop calendar
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {open ? 'Hide' : 'Set up'}
          </span>
        </button>

        {open && (
          <div className="mt-3 space-y-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Add this link to your calendar once. Every scheduled task then
              shows up on its own — including ones your manager assigns later —
              with a reminder 30 minutes before. Keep the link private: anyone
              who has it can see your schedule.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                {data.url}
              </code>
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" asChild>
                {/* webcal:// hands the link to the OS calendar app rather than
                    the browser, which is what makes this one tap on mobile. */}
                <a href={data.webcalUrl}>Add to Apple / Outlook</a>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <a
                  href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(data.webcalUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Add to Google Calendar
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={rotate.isPending}
                onClick={() => rotate.mutate()}
                title="Invalidates the old link everywhere"
              >
                <RefreshCw />
                Reset link
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              On Android, add the link in Google Calendar on the web — the
              phone app syncs it down automatically afterwards.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
