'use client';

// Contact workspace: the person's profile, their account, their deals and
// the activity timeline — the page search results and notifications
// deep-link to.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  Archive,
  ArrowLeft,
  Briefcase,
  CalendarPlus,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { visibleUserIds } from '@/lib/rbac';
import { hasCapability } from '@/lib/policy';
import { cn, formatINR, initials, whatsappLink } from '@/lib/utils';
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

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const { state, currentUser, updateContact, archiveContact, stages } =
    useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [edit, setEdit] = useState({
    name: '',
    title: '',
    phone: '',
    email: '',
  });

  const contact = state.contacts.find((c) => c.id === params.id);

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  if (!currentUser) return null;

  if (!contact || !visible.has(contact.ownerId) || contact.archived) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">
          This contact does not exist, is archived, or is outside your
          visibility scope.
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/contacts">Back to contacts</Link>
        </Button>
      </div>
    );
  }

  const account = contact.accountId
    ? state.accounts.find((a) => a.id === contact.accountId)
    : undefined;
  const owner = state.users.find((u) => u.id === contact.ownerId);
  const deals = state.deals
    .filter((d) => d.contactId === contact.id && !d.archived)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const canArchive = hasCapability(currentUser.role, 'archive_records');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/contacts" aria-label="Back to contacts">
            <ArrowLeft />
          </Link>
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarFallback>{initials(contact.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {contact.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[contact.title, account?.name ?? contact.company]
              .filter(Boolean)
              .join(' · ') || 'No details'}{' '}
            · owned by {owner?.name ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Edit contact"
            onClick={() => {
              setEdit({
                name: contact.name,
                title: contact.title,
                phone: contact.phone,
                email: contact.email,
              });
              setEditOpen(true);
            }}
          >
            <Pencil />
          </Button>
          {canArchive && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Archive contact"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive />
            </Button>
          )}
          {contact.phone && (
            <Button
              variant="outline"
              className="text-green-600 hover:text-green-700 dark:text-green-500"
              asChild
            >
              <a
                href={whatsappLink(
                  contact.phone,
                  `Hi ${contact.name.split(' ')[0]},`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
          )}
          {contact.email && (
            <EmailDialog
              relatedType="contact"
              relatedId={contact.id}
              to={contact.email}
              trigger={
                <Button variant="outline">
                  <Mail />
                  Email
                </Button>
              }
            />
          )}
          <ActivityDialog
            relatedType="contact"
            relatedId={contact.id}
            relatedName={contact.name}
            trigger={
              <Button variant="outline">
                <CalendarPlus />
                Log activity
              </Button>
            }
          />
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
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone.replace(/\s/g, '')}`}
                    className="underline-offset-4 hover:text-primary hover:underline"
                  >
                    {contact.phone}
                  </a>
                ) : (
                  '—'
                )}
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="underline-offset-4 hover:text-primary hover:underline"
                  >
                    {contact.email}
                  </a>
                ) : (
                  '—'
                )}
              </div>
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                {account ? (
                  <Link
                    href={`/accounts/${account.id}`}
                    className="underline-offset-4 hover:text-primary hover:underline"
                  >
                    {account.name}
                  </Link>
                ) : (
                  contact.company || '—'
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Added</p>
                <p className="font-medium">
                  {format(new Date(contact.createdAt), 'd MMM yyyy')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Deals</CardTitle>
              <CardDescription>{deals.length} in total</CardDescription>
            </CardHeader>
            <CardContent>
              {deals.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No deals yet — create one from the Contacts list.
                </p>
              ) : (
                <ul className="space-y-2">
                  {deals.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/pipeline/${d.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                      >
                        <p className="min-w-0 truncate text-sm font-medium">
                          {d.title}
                        </p>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={cn(
                              d.stage === 'won' &&
                                'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                            )}
                          >
                            {stages[d.stage].label}
                          </Badge>
                          <span className="text-sm font-semibold tabular-nums">
                            {formatINR(d.value)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Activity timeline</CardTitle>
            <CardDescription>
              Calls, meetings, emails and notes with {contact.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityTimeline relatedType="contact" relatedId={contact.id} />
          </CardContent>
        </Card>
      </div>

      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Job title</Label>
                <Input
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={edit.phone}
                  onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!edit.name.trim() || !edit.phone.trim()}
              onClick={() => {
                updateContact(contact.id, {
                  name: edit.name.trim(),
                  title: edit.title.trim(),
                  phone: edit.phone.trim(),
                  email: edit.email.trim(),
                });
                setEditOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {contact.name}?</DialogTitle>
            <DialogDescription>
              The contact is hidden from lists and search. Their deals and
              history are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => archiveContact(contact.id)}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
