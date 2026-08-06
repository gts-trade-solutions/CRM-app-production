'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ArrowRightCircle,
  Building,
  CalendarPlus,
  CloudOff,
  Mail,
  MessageCircle,
  Paperclip,
  Pencil,
  Phone,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { visibleUserIds } from '@/lib/rbac';
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
  const router = useRouter();
  const {
    state,
    currentUser,
    setLeadStatus,
    convertLead,
    updateLead,
    addLeadAttachments,
    removeLeadAttachment,
  } = useStore();
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

  const lead = state.leads.find((l) => l.id === params.id);

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  if (!currentUser) return null;

  if (!lead || !visible.has(lead.ownerId)) {
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
  const owner = state.users.find((u) => u.id === lead.ownerId);
  const activityCount = state.salesActivities.filter(
    (a) => a.relatedType === 'lead' && a.relatedId === lead.id,
  ).length;
  const score = leadScore(lead, activityCount);
  const tier = scoreTier(score);
  const isOpen =
    lead.status !== 'converted' && lead.status !== 'disqualified';
  const linkedDeal = state.deals.find(
    (d) => state.contacts.find((c) => c.leadId === lead.id)?.id === d.contactId,
  );

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
    if (!lead || !currentUser || !fileList?.length) return;
    const attachments = await filesToAttachments(fileList, currentUser.id);
    addLeadAttachments(lead.id, attachments);
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
            {lead.pendingSync && (
              <Badge variant="outline" className="gap-1 text-amber-600">
                <CloudOff className="h-3 w-3" />
                queued offline
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {lead.company || 'No company'} · owned by {owner?.name ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={openEdit} aria-label="Edit lead">
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
                <CardDescription>Move the lead along its lifecycle.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(['contacted', 'qualified'] as LeadStatus[])
                  .filter((s) => s !== lead.status)
                  .map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      onClick={() => setLeadStatus(lead.id, s)}
                    >
                      Mark {LEAD_STATUS_CONFIG[s].label.toLowerCase()}
                    </Button>
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    setLeadStatus(lead.id, 'disqualified');
                  }}
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
                      {att.dataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={att.dataUrl}
                          alt={att.name}
                          className="h-10 w-10 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {att.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(att.size)} ·{' '}
                          {format(new Date(att.uploadedAt), 'd MMM yyyy')}
                        </p>
                      </div>
                      <button
                        aria-label={`Remove ${att.name}`}
                        onClick={() => removeLeadAttachment(lead.id, att.id)}
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

          {lead.status === 'converted' && linkedDeal && (
            <Card>
              <CardContent className="p-4 text-sm">
                Converted — see deal{' '}
                <Link
                  href={`/pipeline/${linkedDeal.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {linkedDeal.title}
                </Link>
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
              disabled={!edit.name.trim() || !edit.phone.trim()}
              onClick={() => {
                updateLead(lead.id, {
                  name: edit.name.trim(),
                  company: edit.company.trim(),
                  phone: edit.phone.trim(),
                  email: edit.email.trim(),
                  estimatedValue: Number(edit.estimatedValue) || 0,
                  notes: edit.notes,
                });
                setEditOpen(false);
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert lead</DialogTitle>
            <DialogDescription>
              Creates a contact and opens a Cold deal — you&apos;ll be taken
              straight to it.
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
              disabled={!dealTitle.trim()}
              onClick={() => {
                const dealId = convertLead(
                  lead.id,
                  dealTitle,
                  Number(dealValue) || 0,
                );
                setConvertOpen(false);
                router.push(dealId ? `/pipeline/${dealId}` : '/pipeline');
              }}
            >
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
