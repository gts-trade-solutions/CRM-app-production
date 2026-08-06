'use client';

// Email composer: sends via SES when the server has it configured (the
// response says which happened) and always logs to the timeline.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { VoiceInput } from '@/components/voice-input';
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
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!subject.trim()) return;
    setSending(true);
    try {
      const result = await api<{ sent: boolean }>('/api/email', {
        method: 'POST',
        json: {
          to,
          subject: subject.trim(),
          body: body.trim(),
          relatedType,
          relatedId,
        },
      });
      toast.success(
        result.sent
          ? `Email sent to ${to}`
          : 'Email logged (sending service not configured)',
      );
      qc.invalidateQueries({ queryKey: ['activities'] });
      setSubject('');
      setBody('');
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            Sent from the organisation address and logged to the
            record&apos;s timeline.
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
            <div className="flex items-center justify-between">
              <Label htmlFor="em-body">Message</Label>
              <VoiceInput
                onText={(text) =>
                  setBody((prev) => (prev ? `${prev} ${text}` : text))
                }
              />
            </div>
            <Textarea
              id="em-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={send} disabled={!subject.trim() || sending}>
            <Send />
            {sending ? 'Sending…' : 'Send & log'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
