'use client';

// Lead workspace — API-backed: detail, edit, qualification, attachments,
// timeline, conversion. Server enforces scope; a 404 here means outside
// your hierarchy or nonexistent.

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRightCircle,
  Building,
  CalendarPlus,
  Mail,
  MessageCircle,
  Paperclip,
  Pencil,
  Phone,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import {
  useActivities,
  useConvertLead,
  useLead,
  useMe,
  useUpdateLead,
} from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import {
  LEAD_STATUS_CONFIG,
  LeadStatus,
  SOURCE_CONFIG,
} from '@/lib/types';
import {
  cn,
  filesToAttachments,
  formatBytes,
  formatINR,
  initials,
  whatsappLink,
} from '@/lib/utils';
import { leadScore, scoreTier } from '@/lib/scoring';
import { ActivityDialog } from '@/components/activities/activity-dialog';
import { ActivityTimeline } from '@/components/activities/activity-timeline';
import { EmailDialog } from '@/components/email-dialog';
import { PrivacyMenu } from '@/components/privacy-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: lead, isLoading, error } = useLead(params.id);
  const { data: leadActivities } = useActivities({
    relatedType: 'lead',
    relatedId: params.id,
  });
  const updateLead = useUpdateLead(params.id);
  const convert = useConvertLead();

  const [convertOpen, setConvertOpen] = useState(false);
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    estimatedValue: '',
    notes: '',
  });

  if (!me) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 lg:grid-cols-[1fr,1.6fr]">
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">
          This lead does not exist or is outside your visibility scope.
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/leads">Back to leads</Link>
        </Button>
      </div>
    );
  }

  const source = SOURCE_CONFIG[lead.source];
  const status = LEAD_STATUS_CONFIG[lead.status];
  const isOpen =
    lead.status !== 'converted' && lead.status !== 'disqualified';
  const score = leadScore(lead, leadActivities?.length ?? 0);
  const tier = scoreTier(score);

  function openConvert() {
    if (!lead) return;
    setDealTitle(
      lead.company
        ? `${lead.company} — New opportunity`
        : `${lead.name} — New opportunity`,
    );
    setDealValue(String(lead.estimatedValue || ''));
    setConvertOpen(true);
  }

  function openEdit() {
    if (!lead) return;
    setEdit({
      name: lead.name,
      company: lead.company,
      phone: lead.phone,
      email: lead.email,
      estimatedValue: String(lead.estimatedValue || ''),
      notes: lead.notes,
    });
    setEditOpen(true);
  }

  async function handleUpload(fileList: FileList | null) {
    if (!lead || !fileList?.length) return;
    const attachments = await filesToAttachments(fileList, me!.id);
    await api(`/api/leads/${lead.id}/attachments`, {
      method: 'POST',
      json: {
        attachments: attachments.map((a) => ({
          name: a.name,
          size: a.size,
          type: a.type,
          dataUrl: a.dataUrl,
        })),
      },
    });
    qc.invalidateQueries({ queryKey: ['lead', lead.id] });
  }

  async function removeAttachment(attachmentId: string) {
    if (!lead) return;
    await api(`/api/leads/${lead.id}/attachments`, {
      method: 'DELETE',
      json: { attachmentId },
    });
    qc.invalidateQueries({ queryKey: ['lead', lead.id] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/leads" aria-label="Back to leads">
            <ArrowLeft />
          </Link>
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarFallback>{initials(lead.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {lead.name}
            </h1>
            <Badge
              variant="outline"
              className={cn('border-transparent', status.className)}
            >
              {status.label}
            </Badge>
            {isOpen && (
              <Badge
                variant="outline"
                className={cn('border-transparent', tier.className)}
                title="Lead score: source quality + value + freshness + engagement"
              >
                {tier.label} · {score}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {lead.company || 'No company'} · owned by {lead.owner?.name ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrivacyMenu type="lead" id={lead.id} name={lead.name} />
          <Button
            variant="outline"
            size="icon"
            onClick={openEdit}
            aria-label="Edit lead"
          >
            <Pencil />
          </Button>
          {lead.phone && (
            <Button
              variant="outline"
              className="text-green-600 hover:text-green-700 dark:text-green-500"
              asChild
            >
              <a
                href={whatsappLink(
                  lead.phone,
                  `Hi ${lead.name.split(' ')[0]}, following up on your enquiry —`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
          )}
          {lead.email && (
            <EmailDialog
              relatedType="lead"
              relatedId={lead.id}
              to={lead.email}
              trigger={
                <Button variant="outline">
                  <Mail />
                  Email
                </Button>
              }
            />
          )}
          <ActivityDialog
            relatedType="lead"
            relatedId={lead.id}
            relatedName={lead.name}
            trigger={
              <Button variant="outline">
                <CalendarPlus />
                Log activity
              </Button>
            }
          />
          {isOpen && (
            <Button onClick={openConvert}>
              <ArrowRightCircle />
              Convert to deal
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr,1.6fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {lead.phone ? (
                  <a
                    href={`tel:${lead.phone.replace(/\s/g, '')}`}
                    className="underline-offset-4 hover:text-primary hover:underline"
                  >
                    {lead.phone}
                  </a>
                ) : (
                  '—'
                )}
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {lead.email ? (
                  <a
                    href={`mailto:${lead.email}`}
                    className="underline-offset-4 hover:text-primary hover:underline"
                  >
                    {lead.email}
                  </a>
                ) : (
                  '—'
                )}
              </div>
              <div className="flex items-center gap-3">
                <Building className="h-4 w-4 text-muted-foreground" />
                {lead.company || '—'}
              </div>
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span>
                  {source.label}
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {source.channel === 'online' ? 'Online' : 'Offline'} channel
                  </Badge>
                </span>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Est. value</p>
                  <p className="font-medium">
                    {lead.estimatedValue
                      ? formatINR(lead.estimatedValue)
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {format(new Date(lead.createdAt), 'd MMM yyyy')}
                  </p>
                </div>
              </div>
              {lead.notes && (
                <>
                  <Separator />
                  <p className="text-muted-foreground">{lead.notes}</p>
                </>
              )}
            </CardContent>
          </Card>

          {isOpen && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Qualification</CardTitle>
                <CardDescription>
                  Move the lead along its lifecycle.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(['contacted', 'qualified'] as LeadStatus[])
                  .filter((s) => s !== lead.status)
                  .map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      disabled={updateLead.isPending}
                      onClick={() => updateLead.mutate({ status: s })}
                    >
                      Mark {LEAD_STATUS_CONFIG[s].label.toLowerCase()}
                    </Button>
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={updateLead.isPending}
                  onClick={() => updateLead.mutate({ status: 'disqualified' })}
                >
                  Disqualify
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Attachments</CardTitle>
                  <CardDescription>
                    Enquiry forms, visiting cards, site photos.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <label className="cursor-pointer">
                    <Upload />
                    Upload
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      className="sr-only"
                      onChange={(e) => {
                        handleUpload(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(lead.attachments ?? []).length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">
                  Nothing attached yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(lead.attachments ?? []).map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center gap-3 rounded-lg border p-2.5"
                    >
                      {att.url && att.type.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={att.url}
                          alt={att.name}
                          className="h-10 w-10 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {att.url ? (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
                          >
                            {att.name}
                          </a>
                        ) : (
                          <p className="truncate text-sm font-medium">
                            {att.name}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(att.size)} ·{' '}
                          {format(new Date(att.uploadedAt), 'd MMM yyyy')}
                        </p>
                      </div>
                      <button
                        aria-label={`Remove ${att.name}`}
                        onClick={() => removeAttachment(att.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {lead.status === 'converted' && (
            <Card>
              <CardContent className="p-4 text-sm">
                Converted — the contact and deal live in the pipeline.
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Activity timeline</CardTitle>
            <CardDescription>
              Calls, meetings, tasks and notes on this lead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityTimeline relatedType="lead" relatedId={lead.id} />
          </CardContent>
        </Card>
      </div>

      {/* Edit lead */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit lead</DialogTitle>
            <DialogDescription>
              Fix details captured in the field.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ed-name">Name</Label>
                <Input
                  id="ed-name"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-company">Company</Label>
                <Input
                  id="ed-company"
                  value={edit.company}
                  onChange={(e) =>
                    setEdit({ ...edit, company: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ed-phone">Phone</Label>
                <Input
                  id="ed-phone"
                  value={edit.phone}
                  onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-email">Email</Label>
                <Input
                  id="ed-email"
                  type="email"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-value">Estimated value (₹)</Label>
              <Input
                id="ed-value"
                type="number"
                min={0}
                value={edit.estimatedValue}
                onChange={(e) =>
                  setEdit({ ...edit, estimatedValue: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-notes">Notes</Label>
              <Input
                id="ed-notes"
                value={edit.notes}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={
                !edit.name.trim() || !edit.phone.trim() || updateLead.isPending
              }
              onClick={() =>
                updateLead.mutate(
                  {
                    name: edit.name.trim(),
                    company: edit.company.trim(),
                    phone: edit.phone.trim(),
                    email: edit.email.trim(),
                    estimatedValue: Number(edit.estimatedValue) || 0,
                    notes: edit.notes,
                  },
                  { onSuccess: () => setEditOpen(false) },
                )
              }
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert lead</DialogTitle>
            <DialogDescription>
              Creates a contact, links or creates the account, and opens a
              Cold deal — atomically, on the server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cv-title">Deal title</Label>
              <Input
                id="cv-title"
                value={dealTitle}
                onChange={(e) => setDealTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cv-value">Deal value (₹)</Label>
              <Input
                id="cv-value"
                type="number"
                min={0}
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!dealTitle.trim() || convert.isPending}
              onClick={() =>
                convert.mutate(
                  {
                    leadId: lead.id,
                    dealTitle,
                    value: Number(dealValue) || 0,
                  },
                  {
                    onSuccess: () => {
                      setConvertOpen(false);
                      qc.invalidateQueries({ queryKey: ['lead', lead.id] });
                    },
                  },
                )
              }
            >
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
