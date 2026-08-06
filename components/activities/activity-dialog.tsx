'use client';

// Schedule an activity (call / meeting / task / email) or log a note.
// - "Assign to" lets managers delegate down their hierarchy (the assignee
//   gets a notification); reps only see themselves.
// - When no related record is passed (e.g. from My Day), a record picker
//   offers the open leads and deals in the actor's scope.

import { useMemo, useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/lib/store';
import { assignableUsers, visibleUserIds } from '@/lib/rbac';
import {
  ACTIVITY_KIND_LABELS,
  SalesActivityKind,
} from '@/lib/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export function ActivityDialog({
  relatedType,
  relatedId,
  relatedName,
  trigger,
}: {
  relatedType?: 'lead' | 'deal' | 'contact';
  relatedId?: string;
  relatedName?: string;
  trigger: React.ReactNode;
}) {
  const { state, currentUser, addSalesActivity } = useStore();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SalesActivityKind>('call');
  const [subject, setSubject] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [ownerId, setOwnerId] = useState(currentUser?.id ?? '');
  // Record picker value, encoded as "lead:<id>" / "deal:<id>".
  const [relatedKey, setRelatedKey] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locating, setLocating] = useState(false);

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error('Location is not available on this device');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        });
        setLocating(false);
      },
      () => {
        toast.error('Could not get location — permission denied?');
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  const needsPicker = !relatedType || !relatedId;

  const assignees = useMemo(
    () => (currentUser ? assignableUsers(state.users, currentUser) : []),
    [state.users, currentUser],
  );

  const pickerOptions = useMemo(() => {
    if (!currentUser || !needsPicker) return [];
    const visible = visibleUserIds(state.users, currentUser);
    const leads = state.leads
      .filter(
        (l) =>
          visible.has(l.ownerId) &&
          l.status !== 'converted' &&
          l.status !== 'disqualified',
      )
      .map((l) => ({
        key: `lead:${l.id}`,
        label: `Lead — ${l.name}${l.company ? ` (${l.company})` : ''}`,
      }));
    const deals = state.deals
      .filter(
        (d) =>
          visible.has(d.ownerId) && d.stage !== 'won' && d.stage !== 'lost',
      )
      .map((d) => ({ key: `deal:${d.id}`, label: `Deal — ${d.title}` }));
    return [...leads, ...deals];
  }, [state.leads, state.deals, state.users, currentUser, needsPicker]);

  if (!currentUser) return null;

  const canSubmit =
    subject.trim().length > 0 && (!needsPicker || relatedKey !== '');

  function submit() {
    if (!canSubmit) return;
    let type = relatedType;
    let id = relatedId;
    if (needsPicker) {
      const [t, ...rest] = relatedKey.split(':');
      type = t as 'lead' | 'deal';
      id = rest.join(':');
    }
    if (!type || !id) return;
    addSalesActivity({
      kind,
      subject: subject.trim(),
      notes: notes.trim(),
      relatedType: type,
      relatedId: id,
      ownerId,
      dueAt:
        kind !== 'note' && dueAt ? new Date(dueAt).toISOString() : undefined,
      location: coords ?? undefined,
    });
    setSubject('');
    setDueAt('');
    setNotes('');
    setOwnerId(currentUser?.id ?? '');
    setRelatedKey('');
    setCoords(null);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {assignees.length > 1 ? 'Log or assign activity' : 'Log activity'}
          </DialogTitle>
          <DialogDescription>
            {relatedName ? `For ${relatedName}` : 'Pick a record and schedule work on it.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {needsPicker && (
            <div className="space-y-1.5">
              <Label>Related to *</Label>
              <Select value={relatedKey} onValueChange={setRelatedKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a lead or deal" />
                </SelectTrigger>
                <SelectContent>
                  {pickerOptions.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as SalesActivityKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(ACTIVITY_KIND_LABELS) as SalesActivityKind[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ACTIVITY_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {kind !== 'note' && (
              <div className="space-y-1.5">
                <Label htmlFor="act-due">Due</Label>
                <Input
                  id="act-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
            )}
          </div>
          {/* Delegation: only offered when the actor manages other people. */}
          {assignees.length > 1 && kind !== 'note' && (
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignees.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                      {u.id === currentUser.id ? ' (me)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="act-subject">Subject *</Label>
            <Input
              id="act-subject"
              placeholder={
                kind === 'note' ? 'What happened?' : 'What needs to be done?'
              }
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-notes">Notes</Label>
            <Textarea
              id="act-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {/* Field check-in: proves the rep was on site */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={captureLocation}
            disabled={locating || !!coords}
            className={coords ? 'text-emerald-600 dark:text-emerald-400' : ''}
          >
            {coords ? <Check /> : <MapPin />}
            {coords
              ? `Location captured (${coords.lat}, ${coords.lng})`
              : locating
                ? 'Getting location…'
                : 'Check in with location'}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!canSubmit}>
            {kind === 'note'
              ? 'Add note'
              : ownerId !== currentUser.id
                ? 'Assign'
                : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
