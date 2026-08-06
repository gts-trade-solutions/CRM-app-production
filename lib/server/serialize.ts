// Wire serializers: DB rows (paise BigInt, Date) → JSON shapes matching
// the frontend's lib/types.ts contract (rupees, ISO strings).

import type {
  Account,
  Contact,
  Deal,
  DealLineItem,
  Lead,
  Notification,
  Quote,
  SalesActivity,
  User,
} from '@prisma/client';
import { toRupees } from './db';

type Named = { id: string; name: string };

export function serializeUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    managerId: u.managerId,
    region: u.region,
    title: u.title,
    active: u.active,
  };
}

export function serializeLead(l: Lead & { owner?: Named }) {
  return {
    id: l.id,
    name: l.name,
    company: l.company,
    phone: l.phone,
    email: l.email,
    source: l.source,
    status: l.status,
    ownerId: l.ownerId,
    owner: l.owner,
    estimatedValue: toRupees(l.estimatedPaise),
    notes: l.notes,
    campaignId: l.campaignId,
    pendingSync: l.pendingSync,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export function serializeContact(c: Contact & { owner?: Named; account?: Named | null }) {
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    title: c.title,
    phone: c.phone,
    email: c.email,
    ownerId: c.ownerId,
    owner: c.owner,
    leadId: c.leadId,
    accountId: c.accountId,
    account: c.account ?? null,
    archived: c.archived,
    createdAt: c.createdAt.toISOString(),
  };
}

export function serializeAccount(a: Account & { owner?: Named }) {
  return {
    id: a.id,
    name: a.name,
    industry: a.industry,
    city: a.city,
    website: a.website,
    ownerId: a.ownerId,
    owner: a.owner,
    archived: a.archived,
    createdAt: a.createdAt.toISOString(),
  };
}

export function serializeDeal(
  d: Deal & {
    owner?: Named;
    contact?: Named & { accountId?: string | null };
    lineItems?: (DealLineItem & { product?: { name: string; sku: string } })[];
  },
) {
  return {
    id: d.id,
    title: d.title,
    contactId: d.contactId,
    contact: d.contact,
    ownerId: d.ownerId,
    owner: d.owner,
    stage: d.stage,
    value: toRupees(d.valuePaise),
    discountPercent: d.discountBps / 100,
    expectedClose: d.expectedClose.toISOString(),
    closedAt: d.closedAt?.toISOString() ?? null,
    lostReason: d.lostReason,
    archived: d.archived,
    createdAt: d.createdAt.toISOString(),
    lineItems: d.lineItems?.map((it) => ({
      productId: it.productId,
      productName: it.product?.name,
      sku: it.product?.sku,
      qty: it.qty,
      price: toRupees(it.pricePaise),
    })),
  };
}

export function serializeQuote(q: Quote) {
  return {
    id: q.id,
    dealId: q.dealId,
    number: q.number,
    subtotal: toRupees(q.subtotalPaise),
    discount: toRupees(q.discountPaise),
    gst: toRupees(q.gstPaise),
    total: toRupees(q.totalPaise),
    status: q.status,
    createdAt: q.createdAt.toISOString(),
  };
}

export function serializeActivity(a: SalesActivity & { owner?: Named; createdBy?: Named | null }) {
  return {
    id: a.id,
    kind: a.kind,
    subject: a.subject,
    notes: a.notes,
    relatedType: a.relatedType,
    relatedId: a.relatedId,
    ownerId: a.ownerId,
    owner: a.owner,
    createdById: a.createdById,
    createdBy: a.createdBy ?? null,
    dueAt: a.dueAt?.toISOString() ?? null,
    completedAt: a.completedAt?.toISOString() ?? null,
    location: a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null,
    createdAt: a.createdAt.toISOString(),
  };
}

export function serializeNotification(n: Notification) {
  return {
    id: n.id,
    message: n.message,
    href: n.href,
    read: n.read,
    at: n.createdAt.toISOString(),
  };
}
