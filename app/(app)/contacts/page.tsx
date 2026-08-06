'use client';

// Contacts list — API-backed with server pagination and search.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  WireContact,
  useAccounts,
  useContacts,
  useCreateContact,
  useCreateDeal,
} from '@/lib/api/crm-hooks';
import { useApiUsers, useMe } from '@/lib/api/hooks';
import { initials, whatsappLink } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  ownerId: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function ContactsPage() {
  const { data: me } = useMe();
  const { data: users } = useApiUsers();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>('none');
  const [dealFor, setDealFor] = useState<WireContact | null>(null);
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('');

  const createContact = useCreateContact();
  const createDeal = useCreateDeal();
  const { data: accountsPage } = useAccounts({ page: 1 });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useContacts({ page, q: debouncedQ });

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
      ownerId: '',
    },
  });

  if (!me) return null;
  const owners = (users ?? []).filter((u) => u.active);
  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  function onSubmit(values: ContactFormValues) {
    createContact.mutate(
      {
        ...values,
        ownerId: values.ownerId || me!.id,
        accountId: accountId !== 'none' ? accountId : undefined,
      },
      {
        onSuccess: () => {
          reset();
          setAccountId('none');
          setOpen(false);
        },
      },
    );
  }

  function openDealDialog(contact: WireContact) {
    setDealFor(contact);
    setDealTitle(
      contact.account?.name || contact.company
        ? `${contact.account?.name ?? contact.company} — New opportunity`
        : `${contact.name} — New opportunity`,
    );
    setDealValue('');
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
                      {(accountsPage?.accounts ?? []).map((a) => (
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
                  <Label>Owner</Label>
                  <Select
                    value={watch('ownerId') || me.id}
                    onValueChange={(v) => setValue('ownerId', v)}
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
                <Button type="submit" disabled={createContact.isPending}>
                  Create contact
                </Button>
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
                <TableHead className="hidden lg:table-cell">Added</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={`s-${i}`}>
                    <TableCell colSpan={5}>
                      <div className="h-9 animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && (data?.contacts ?? []).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No contacts yet. Convert a qualified lead or add one
                    directly.
                  </TableCell>
                </TableRow>
              )}
              {(data?.contacts ?? []).map((contact) => (
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
                          {contact.account ? (
                            <Link
                              href={`/accounts/${contact.account.id}`}
                              className="underline-offset-4 hover:text-primary hover:underline"
                            >
                              {contact.account.name}
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
                    {contact.owner?.name ?? '—'}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {format(new Date(contact.createdAt), 'd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data ? `${data.total} contact${data.total === 1 ? '' : 's'}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft />
            Prev
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>

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
            <Button
              disabled={!dealTitle.trim() || createDeal.isPending}
              onClick={() => {
                if (!dealFor) return;
                createDeal.mutate(
                  {
                    contactId: dealFor.id,
                    title: dealTitle,
                    value: Number(dealValue) || 0,
                  },
                  { onSuccess: () => setDealFor(null) },
                );
              }}
            >
              Create deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
