'use client';

// Demo email composer — API-backed: "sends" and logs a completed email
// activity on the record's timeline. Real provider send lands in M4 (SES).

import { useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateActivity } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function EmailDialog({
  relatedType,
  relatedId,
  to,
  trigger,
}: {
  relatedType: 'lead' | 'deal' | 'contact';
  relatedId: string;
  to: string;
  trigger: React.ReactNode;
}) {
  const createActivity = useCreateActivity();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  function send() {
    if (!subject.trim()) return;
    createActivity.mutate(
      {
        kind: 'email',
        subject: `Email: ${subject.trim()}`,
        notes: `To ${to}${body.trim() ? ` — ${body.trim()}` : ''}`,
        relatedType,
        relatedId,
        completedAt: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          toast.success('Email logged to the timeline');
          setSubject('');
          setBody('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            Logged to the record&apos;s timeline. (Demo — no real email is
            sent.)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="em-to">To</Label>
            <Input id="em-to" value={to} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-subject">Subject *</Label>
            <Input
              id="em-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-body">Message</Label>
            <Textarea
              id="em-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={send}
            disabled={!subject.trim() || createActivity.isPending}
          >
            <Send />
            Send & log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
