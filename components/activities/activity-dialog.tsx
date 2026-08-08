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
  // Multi-record mode: one task covering several leads, ticked off one by one.
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState('');

  const needsPicker = !relatedType || !relatedId;

  // Record picker sources — only fetched while the dialog is open.
  // Picking "everyone at this company" only means something if the whole
  // company is loaded, so the picker asks for the server's maximum page.
  const { data: leadPage } = useLeads({ page: 1, q: leadSearch, pageSize: 100 });
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

  const openLeads = useMemo(
    () =>
      (leadPage?.leads ?? []).filter(
        (l) => l.status !== 'converted' && l.status !== 'disqualified',
      ),
    [leadPage],
  );

  const pickerOptions = useMemo(() => {
    if (!needsPicker) return [];
    const leads = openLeads.map((l) => ({
      key: `lead:${l.id}`,
      label: `Lead — ${l.name}${l.company ? ` (${l.company})` : ''}`,
    }));
    const deals =
      openDeals?.map((d) => ({ key: `deal:${d.id}`, label: `Deal — ${d.title}` })) ??
      [];
    return [...leads, ...deals];
  }, [needsPicker, openLeads, openDeals]);

  /** Leads grouped by company so a whole company can be taken in one tick. */
  const companies = useMemo(() => {
    const byCompany = new Map<string, typeof openLeads>();
    for (const l of openLeads) {
      const key = l.company?.trim() || 'No company';
      const bucket = byCompany.get(key);
      if (bucket) bucket.push(l);
      else byCompany.set(key, [l]);
    }
    return Array.from(byCompany.entries())
      .map(([company, leads]) => ({ company, leads }))
      // Multi-lead companies first — they are the reason this grouping exists.
      .sort(
        (a, b) =>
          b.leads.length - a.leads.length || a.company.localeCompare(b.company),
      );
  }, [openLeads]);

  function togglePicked(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleCompany(leads: typeof openLeads) {
    const ids = leads.map((l) => l.id);
    const allPicked = ids.every((id) => picked.includes(id));
    setPicked((prev) =>
      allPicked
        ? prev.filter((id) => !ids.includes(id))
        : Array.from(new Set([...prev, ...ids])),
    );
  }

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
    subject.trim().length > 0 &&
    (!needsPicker || (multi ? picked.length > 0 : relatedKey !== ''));

  function submit() {
    if (!canSubmit) return;
    let type = relatedType;
    let id = relatedId;
    const targets =
      needsPicker && multi
        ? picked.map((leadId) => ({
            relatedType: 'lead' as const,
            relatedId: leadId,
          }))
        : undefined;
    if (targets?.length) {
      // The server mirrors the first target onto relatedType/relatedId.
      type = 'lead';
      id = targets[0].relatedId;
    } else if (needsPicker) {
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
        targets,
      },
      {
        onSuccess: () => {
          toast.success(
            effectiveOwner !== me!.id
              ? 'Assigned'
              : targets?.length
                ? `Task created across ${targets.length} leads`
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
          setMulti(false);
          setPicked([]);
          setLeadSearch('');
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{multi ? 'Leads to call *' : 'Related to *'}</Label>
                <button
                  type="button"
                  onClick={() => setMulti((v) => !v)}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  {multi ? 'Just one record' : 'Several leads in one task'}
                </button>
              </div>
              {multi ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Search leads by name, company or phone"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                  />
                  <div className="max-h-56 overflow-y-auto rounded-md border">
                    {companies.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        No open leads match.
                      </p>
                    ) : (
                      companies.map(({ company, leads }) => {
                        const ids = leads.map((l) => l.id);
                        const chosen = ids.filter((id) =>
                          picked.includes(id),
                        ).length;
                        return (
                          <div key={company} className="border-b last:border-b-0">
                            <label className="flex cursor-pointer items-center gap-2 bg-muted/50 px-3 py-1.5 text-xs font-medium hover:bg-accent">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 accent-primary"
                                checked={chosen === ids.length}
                                // Partly-chosen companies read as indeterminate
                                // rather than as "none selected".
                                ref={(el) => {
                                  if (el)
                                    el.indeterminate =
                                      chosen > 0 && chosen < ids.length;
                                }}
                                onChange={() => toggleCompany(leads)}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {company}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {leads.length === 1
                                  ? '1 lead'
                                  : `all ${leads.length} leads`}
                              </span>
                            </label>
                            {leads.map((l) => (
                              <label
                                key={l.id}
                                className="flex cursor-pointer items-center gap-2 py-2 pl-8 pr-3 text-sm hover:bg-accent"
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-primary"
                                  checked={picked.includes(l.id)}
                                  onChange={() => togglePicked(l.id)}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {l.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
                    <p>
                      {picked.length === 0
                        ? 'Tick a company to take everyone in it, or pick leads one by one. Searching does not clear your picks.'
                        : `${picked.length} lead${picked.length === 1 ? '' : 's'} selected. The task finishes when you have spoken to all of them.`}
                    </p>
                    {picked.length > 0 && (
                      // Picks survive a search, so there has to be a way to
                      // drop ones that are no longer on screen.
                      <button
                        type="button"
                        onClick={() => setPicked([])}
                        className="shrink-0 font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ) : (
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
              )}
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
            <div className="flex items-center justify-between">
              <Label htmlFor="act-notes">Notes</Label>
              <VoiceInput
                onText={(text) =>
                  setNotes((prev) => (prev ? `${prev} ${text}` : text))
                }
              />
            </div>
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
