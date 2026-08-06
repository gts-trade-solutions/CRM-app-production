'use client';

// Lead capture dialog. Works both online and offline: when the device has
// no connectivity the store queues the lead locally (pendingSync) and
// flushes it automatically once the browser fires `online`.

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Paperclip, Shuffle, WifiOff, X } from 'lucide-react';
import { AUTO_ASSIGN, useStore } from '@/lib/store';
import { assignableUsers } from '@/lib/rbac';
import { LeadSource, SOURCE_CONFIG } from '@/lib/types';
import { filesToAttachments, formatBytes } from '@/lib/utils';
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

const leadSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  company: z.string().default(''),
  phone: z.string().min(6, 'Phone is required'),
  email: z.string().email('Invalid email').or(z.literal('')),
  source: z.string().min(1, 'Pick a source'),
  ownerId: z.string().min(1, 'Pick an owner'),
  estimatedValue: z.coerce.number().min(0).default(0),
  notes: z.string().default(''),
});

type LeadFormValues = z.infer<typeof leadSchema>;

export function LeadFormDialog({ trigger }: { trigger: React.ReactNode }) {
  const { state, currentUser, online, addLead } = useStore();
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState<string>('none');
  const [files, setFiles] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: '',
      company: '',
      phone: '',
      email: '',
      source: '',
      ownerId: currentUser?.id ?? '',
      estimatedValue: 0,
      notes: '',
    },
  });

  const phoneValue = watch('phone');
  const emailValue = watch('email');

  // Duplicate detection: same phone or email on an existing lead/contact.
  const duplicate = useMemo(() => {
    const phone = phoneValue?.replace(/\s/g, '');
    const email = emailValue?.trim().toLowerCase();
    if ((!phone || phone.length < 6) && !email) return null;
    const userName = (id: string) =>
      state.users.find((u) => u.id === id)?.name ?? 'someone';
    for (const l of state.leads) {
      if (
        (phone && phone.length >= 6 && l.phone.replace(/\s/g, '') === phone) ||
        (email && l.email.toLowerCase() === email)
      ) {
        return `Possible duplicate: lead “${l.name}” owned by ${userName(l.ownerId)}`;
      }
    }
    for (const c of state.contacts) {
      if (
        (phone && phone.length >= 6 && c.phone.replace(/\s/g, '') === phone) ||
        (email && c.email.toLowerCase() === email)
      ) {
        return `Possible duplicate: contact “${c.name}” owned by ${userName(c.ownerId)}`;
      }
    }
    return null;
  }, [phoneValue, emailValue, state.leads, state.contacts, state.users]);

  if (!currentUser) return null;
  const owners = assignableUsers(state.users, currentUser);
  const canAutoAssign = owners.some(
    (u) => u.role === 'sales_rep' && u.id !== currentUser.id,
  );

  async function onSubmit(values: LeadFormValues) {
    const attachments =
      files.length > 0 && currentUser
        ? await filesToAttachments(files, currentUser.id)
        : undefined;
    addLead({
      name: values.name,
      company: values.company,
      phone: values.phone,
      email: values.email,
      source: values.source as LeadSource,
      ownerId: values.ownerId,
      estimatedValue: values.estimatedValue,
      notes: values.notes,
      campaignId: campaignId !== 'none' ? campaignId : undefined,
      attachments,
    });
    reset();
    setCampaignId('none');
    setFiles([]);
    setOpen(false);
  }

  const activeCampaigns = state.campaigns.filter(
    (c) => c.status === 'active',
  );

  const sourceValue = watch('source');
  const ownerValue = watch('ownerId');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Capture lead</DialogTitle>
          <DialogDescription>
            Record a lead from any channel — web enquiry, walk-in, field
            visit, event or referral.
          </DialogDescription>
        </DialogHeader>

        {!online && (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <WifiOff className="h-4 w-4 shrink-0" />
            You are offline — this lead will be queued locally and synced when
            connectivity returns.
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Name *</Label>
              <Input id="lead-name" {...register('name')} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-company">Company</Label>
              <Input id="lead-company" {...register('company')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-phone">Phone *</Label>
              <Input id="lead-phone" {...register('phone')} />
              {errors.phone && (
                <p className="text-xs text-destructive">
                  {errors.phone.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-email">Email</Label>
              <Input id="lead-email" type="email" {...register('email')} />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Source *</Label>
              <Select
                value={sourceValue}
                onValueChange={(v) => setValue('source', v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOURCE_CONFIG) as LeadSource[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SOURCE_CONFIG[s].label} (
                      {SOURCE_CONFIG[s].channel === 'online'
                        ? 'Online'
                        : 'Offline'}
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.source && (
                <p className="text-xs text-destructive">
                  {errors.source.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Owner *</Label>
              <Select
                value={ownerValue}
                onValueChange={(v) => setValue('ownerId', v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Assign to" />
                </SelectTrigger>
                <SelectContent>
                  {canAutoAssign && (
                    <SelectItem value={AUTO_ASSIGN}>
                      <span className="flex items-center gap-1.5">
                        <Shuffle className="h-3.5 w-3.5" />
                        Auto-assign (round-robin)
                      </span>
                    </SelectItem>
                  )}
                  {owners.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {activeCampaigns.length > 0 && (
            <div className="space-y-1.5">
              <Label>Campaign attribution</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {activeCampaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {duplicate && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {duplicate}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="lead-value">Estimated value (₹)</Label>
            <Input
              id="lead-value"
              type="number"
              min={0}
              {...register('estimatedValue')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea id="lead-notes" rows={2} {...register('notes')} />
          </div>

          {/* Field capture: enquiry forms, visiting cards, site photos */}
          <div className="space-y-1.5">
            <Label htmlFor="lead-files">
              Attachments (enquiry form, visiting card, photos)
            </Label>
            <Input
              id="lead-files"
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                if (e.target.files?.length) {
                  setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  e.target.value = '';
                }
              }}
            />
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-muted-foreground">
                      {formatBytes(f.size)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" className="w-full sm:w-auto">
              {online ? 'Create lead' : 'Queue lead (offline)'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
