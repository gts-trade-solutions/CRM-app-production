'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Briefcase,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useStore } from '@/lib/store';
import { assignableUsers, visibleUserIds } from '@/lib/rbac';
import { Contact } from '@/lib/types';
import { formatINR, initials, whatsappLink } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const contactSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  company: z.string().default(''),
  title: z.string().default(''),
  phone: z.string().min(6, 'Phone is required'),
  email: z.string().email('Invalid email').or(z.literal('')),
  ownerId: z.string().min(1, 'Pick an owner'),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function ContactsPage() {
  const { state, currentUser, addContact, addDealForContact } = useStore();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>('none');
  const [dealFor, setDealFor] = useState<Contact | null>(null);
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      company: '',
      title: '',
      phone: '',
      email: '',
      ownerId: currentUser?.id ?? '',
    },
  });

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  const userById = useMemo(
    () => new Map(state.users.map((u) => [u.id, u])),
    [state.users],
  );

  const accountById = useMemo(
    () => new Map(state.accounts.map((a) => [a.id, a])),
    [state.accounts],
  );

  const contacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.contacts
      .filter((c) => visible.has(c.ownerId) && !c.archived)
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [state.contacts, visible, search]);

  const dealsByContact = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    for (const d of state.deals) {
      const entry = map.get(d.contactId) ?? { count: 0, value: 0 };
      entry.count += 1;
      if (d.stage !== 'lost') entry.value += d.value;
      map.set(d.contactId, entry);
    }
    return map;
  }, [state.deals]);

  if (!currentUser) return null;
  const owners = assignableUsers(state.users, currentUser);

  function onSubmit(values: ContactFormValues) {
    addContact({
      ...values,
      accountId: accountId !== 'none' ? accountId : undefined,
    });
    reset();
    setAccountId('none');
    setOpen(false);
  }

  function openDealDialog(contact: Contact) {
    setDealFor(contact);
    setDealTitle(
      contact.company
        ? `${contact.company} — New opportunity`
        : `${contact.name} — New opportunity`,
    );
    setDealValue('');
  }

  function handleCreateDeal() {
    if (!dealFor) return;
    addDealForContact(dealFor.id, dealTitle, Number(dealValue) || 0);
    setDealFor(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Qualified relationships — the people deals are made with.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              New contact
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New contact</DialogTitle>
              <DialogDescription>
                Add a person you already have a working relationship with.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">Name *</Label>
                  <Input id="c-name" {...register('name')} />
                  {errors.name && (
                    <p className="text-xs text-destructive">
                      {errors.name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No account</SelectItem>
                      {state.accounts
                        .filter((a) => visible.has(a.ownerId))
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {accountId === 'none' && (
                <div className="space-y-1.5">
                  <Label htmlFor="c-company">Company (free text)</Label>
                  <Input id="c-company" {...register('company')} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-title">Job title</Label>
                  <Input id="c-title" {...register('title')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="c-phone">Phone *</Label>
                  <Input id="c-phone" {...register('phone')} />
                  {errors.phone && (
                    <p className="text-xs text-destructive">
                      {errors.phone.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-email">Email</Label>
                  <Input id="c-email" type="email" {...register('email')} />
                  {errors.email && (
                    <p className="text-xs text-destructive">
                      {errors.email.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Owner *</Label>
                  <Select
                    value={watch('ownerId')}
                    onValueChange={(v) =>
                      setValue('ownerId', v, { shouldValidate: true })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Assign to" />
                    </SelectTrigger>
                    <SelectContent>
                      {owners.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create contact</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead>Deals</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Open + won value
                </TableHead>
                <TableHead className="hidden lg:table-cell">Added</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No contacts yet. Convert a qualified lead or add one
                    directly.
                  </TableCell>
                </TableRow>
              )}
              {contacts.map((contact) => {
                const owner = userById.get(contact.ownerId);
                const deals = dealsByContact.get(contact.id);
                const account = contact.accountId
                  ? accountById.get(contact.accountId)
                  : undefined;
                return (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback>
                            {initials(contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <Link
                            href={`/contacts/${contact.id}`}
                            className="font-medium underline-offset-4 hover:text-primary hover:underline"
                          >
                            {contact.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {contact.title && `${contact.title} · `}
                            {account ? (
                              <Link
                                href={`/accounts/${account.id}`}
                                className="underline-offset-4 hover:text-primary hover:underline"
                              >
                                {account.name}
                              </Link>
                            ) : (
                              contact.company || contact.email
                            )}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <a
                        href={`tel:${contact.phone.replace(/\s/g, '')}`}
                        className="underline-offset-4 hover:text-primary hover:underline"
                      >
                        {contact.phone}
                      </a>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {owner?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{deals?.count ?? 0}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {deals?.value ? formatINR(deals.value) : '—'}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {format(new Date(contact.createdAt), 'd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => openDealDialog(contact)}
                          >
                            <Briefcase />
                            Create deal
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a
                              href={whatsappLink(
                                contact.phone,
                                `Hi ${contact.name.split(' ')[0]},`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MessageCircle className="text-green-600" />
                              WhatsApp
                            </a>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!dealFor} onOpenChange={(o) => !o && setDealFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New deal for {dealFor?.name}</DialogTitle>
            <DialogDescription>
              Opens as a Cold deal in the pipeline, owned by the contact
              owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cd-title">Deal title</Label>
              <Input
                id="cd-title"
                value={dealTitle}
                onChange={(e) => setDealTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cd-value">Deal value (₹)</Label>
              <Input
                id="cd-value"
                type="number"
                min={0}
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateDeal} disabled={!dealTitle.trim()}>
              Create deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
