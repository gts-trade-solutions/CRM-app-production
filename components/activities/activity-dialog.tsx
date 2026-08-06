'use client';

// Schedule an activity or log a note — API-backed. Managers (per the
// policy matrix) can delegate to anyone in their scope; the record picker
// appears when no related record is passed (e.g. from My Day).

import { useMemo, useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import {
  useApiUsers,
  useCreateActivity,
  useLeads,
  useMe,
} from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import { useQuery } from '@tanstack/react-query';
import { hasCapability } from '@/lib/policy';
import { ACTIVITY_KIND_LABELS, SalesActivityKind } from '@/lib/types';
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

interface WireDealLite {
  id: string;
  title: string;
  stage: string;
}

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
  const { data: me } = useMe();
  const { data: users } = useApiUsers();
  const createActivity = useCreateActivity();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SalesActivityKind>('call');
  const [subject, setSubject] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [notes, setNotes] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [relatedKey, setRelatedKey] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locating, setLocating] = useState(false);

  const needsPicker = !relatedType || !relatedId;

  // Record picker sources — only fetched while the dialog is open.
  const { data: leadPage } = useLeads({ page: 1 });
  const { data: openDeals } = useQuery({
    queryKey: ['deals', 'picker'],
    queryFn: () =>
      api<{ deals: WireDealLite[] }>('/api/deals').then((r) =>
        r.deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost'),
      ),
    enabled: open && needsPicker,
  });

  const canAssign = me ? hasCapability(me.role, 'assign_activities') : false;
  const assignees = useMemo(
    () => (users ?? []).filter((u) => u.active),
    [users],
  );

  const pickerOptions = useMemo(() => {
    if (!needsPicker) return [];
    const leads =
      leadPage?.leads
        .filter((l) => l.status !== 'converted' && l.status !== 'disqualified')
        .map((l) => ({
          key: `lead:${l.id}`,
          label: `Lead — ${l.name}${l.company ? ` (${l.company})` : ''}`,
        })) ?? [];
    const deals =
      openDeals?.map((d) => ({ key: `deal:${d.id}`, label: `Deal — ${d.title}` })) ??
      [];
    return [...leads, ...deals];
  }, [needsPicker, leadPage, openDeals]);

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

  if (!me) return null;

  const effectiveOwner = ownerId || me.id;
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
    createActivity.mutate(
      {
        kind,
        subject: subject.trim(),
        notes: notes.trim(),
        relatedType: type,
        relatedId: id,
        ownerId: effectiveOwner,
        dueAt:
          kind !== 'note' && dueAt ? new Date(dueAt).toISOString() : undefined,
        location: coords ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            effectiveOwner !== me!.id
              ? 'Assigned'
              : kind === 'note'
                ? 'Note added'
                : 'Activity scheduled',
          );
          setSubject('');
          setDueAt('');
          setNotes('');
          setOwnerId('');
          setRelatedKey('');
          setCoords(null);
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {canAssign ? 'Log or assign activity' : 'Log activity'}
          </DialogTitle>
          <DialogDescription>
            {relatedName
              ? `For ${relatedName}`
              : 'Pick a record and schedule work on it.'}
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
          {canAssign && assignees.length > 1 && kind !== 'note' && (
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <Select value={effectiveOwner} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignees.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                      {u.id === me.id ? ' (me)' : ''}
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
          <Button
            onClick={submit}
            disabled={!canSubmit || createActivity.isPending}
          >
            {kind === 'note'
              ? 'Add note'
              : effectiveOwner !== me.id
                ? 'Assign'
                : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
