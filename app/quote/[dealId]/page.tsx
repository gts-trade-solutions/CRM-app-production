'use client';

// Printable quotation — API-backed. Company identity/GST/terms come from
// admin-configured org settings; the number and totals from the latest
// stored quote record.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { addDays, format } from 'date-fns';
import { ArrowLeft, Building2, Printer } from 'lucide-react';
import { useContact, useDeal, useSettings } from '@/lib/api/crm-hooks';
import { useMe } from '@/lib/api/hooks';
import { formatINR } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function QuotePage() {
  const params = useParams<{ dealId: string }>();
  const { data: me } = useMe();
  const { data, isLoading } = useDeal(params.dealId);
  const { data: settings } = useSettings();
  const contactId = data?.deal.contactId ?? '';
  const { data: contactData } = useContact(contactId);

  if (isLoading || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!me || !data || !settings.org) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          Quotation unavailable — sign in with access to this deal.
        </p>
        <Button variant="outline" asChild>
          <Link href="/pipeline">Back to pipeline</Link>
        </Button>
      </div>
    );
  }

  const { deal, quotes } = data;
  const org = settings.org;
  const contact = contactData?.contact;
  const account = contact?.account;
  const items = deal.lineItems ?? [];

  const quote = quotes[0];
  const subtotal =
    quote?.subtotal ?? items.reduce((s, it) => s + it.qty * it.price, 0);
  const discount =
    quote?.discount ??
    Math.round((subtotal * (deal.discountPercent ?? 0)) / 100);
  const gst = quote?.gst ?? Math.round((subtotal - discount) * org.gstRate);
  const total = quote?.total ?? subtotal - discount + gst;
  const quoteDate = quote ? new Date(quote.createdAt) : new Date();
  const quoteNo = quote?.number ?? 'DRAFT';

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      {/* Toolbar — hidden when printing */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <Button variant="ghost" asChild>
          <Link href={`/pipeline/${deal.id}`}>
            <ArrowLeft />
            Back to deal
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer />
          Print / Save as PDF
        </Button>
      </div>

      {/* The document */}
      <div className="mx-auto max-w-3xl bg-white p-10 text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-neutral-900 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">
                {org.companyName}
              </p>
              <p className="text-sm text-neutral-500">
                {org.addressLine} · GSTIN {org.gstin}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">QUOTATION</p>
            <p className="mt-1 text-sm text-neutral-500">{quoteNo}</p>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Quoted to
            </p>
            <p className="font-semibold">{contact?.name ?? '—'}</p>
            {(account?.name || contact?.company) && (
              <p>{account?.name ?? contact?.company}</p>
            )}
            {contact?.phone && <p>{contact.phone}</p>}
            {contact?.email && <p>{contact.email}</p>}
          </div>
          <div className="text-right">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Details
            </p>
            <p>Date: {format(quoteDate, 'd MMM yyyy')}</p>
            <p>
              Valid until:{' '}
              {format(addDays(quoteDate, org.quoteValidityDays), 'd MMM yyyy')}
            </p>
            <p>Prepared by: {deal.owner?.name ?? '—'}</p>
            <p className="text-neutral-500">{deal.title}</p>
          </div>
        </section>

        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-neutral-900 text-left">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Item</th>
              <th className="py-2 pr-2 text-right font-semibold">Qty</th>
              <th className="py-2 pr-2 text-right font-semibold">Unit price</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-400">
                  No line items on this deal — add products to generate a
                  quotation.
                </td>
              </tr>
            )}
            {items.map((it, i) => (
              <tr key={it.productId} className="border-b border-neutral-200">
                <td className="py-2.5 pr-2 text-neutral-500">{i + 1}</td>
                <td className="py-2.5 pr-2">
                  <p className="font-medium">{it.productName ?? '—'}</p>
                  <p className="text-xs text-neutral-500">{it.sku}</p>
                </td>
                <td className="py-2.5 pr-2 text-right tabular-nums">
                  {it.qty}
                </td>
                <td className="py-2.5 pr-2 text-right tabular-nums">
                  {formatINR(it.price)}
                </td>
                <td className="py-2.5 text-right font-medium tabular-nums">
                  {formatINR(it.qty * it.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-64 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Subtotal</span>
            <span className="tabular-nums">{formatINR(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Discount</span>
              <span className="tabular-nums">−{formatINR(discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-neutral-500">
              GST ({Math.round(org.gstRate * 100)}%)
            </span>
            <span className="tabular-nums">{formatINR(gst)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-neutral-900 pt-1.5 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(total)}</span>
          </div>
        </div>

        <section className="mt-10 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Terms
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-neutral-600">
              {org.quoteTerms.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-end justify-end">
            <div className="h-16" />
            <p className="border-t border-neutral-400 pt-1 text-neutral-600">
              Authorised signatory
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
