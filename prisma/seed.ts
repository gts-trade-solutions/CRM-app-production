// Seeds the MySQL database with the same demo data the frontend MVP uses
// (lib/mock-data.ts is the single source), converted to DB conventions:
// rupees → paise (BigInt), location → lat/lng columns, settings → rows.
// Idempotent: wipes and re-creates.

import { PrismaClient } from '@prisma/client';
import {
  seedAccounts,
  seedCampaigns,
  seedContacts,
  seedDeals,
  seedLeads,
  seedNotifications,
  seedOrgSettings,
  seedProducts,
  seedSalesActivities,
  seedStageSettings,
  seedTargets,
  seedUsers,
} from '../lib/mock-data';
import { DealStage } from '../lib/types';

const prisma = new PrismaClient();

/** Whole rupees → paise. */
const paise = (rupees: number) => BigInt(Math.round(rupees * 100));

async function main() {
  // Wipe in FK-safe order.
  await prisma.dealLineItem.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.salesActivity.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.leadAttachment.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.account.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.product.deleteMany();
  await prisma.target.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.orgSettings.deleteMany();
  await prisma.stageSetting.deleteMany();
  await prisma.user.deleteMany();

  // Users — seed order already lists managers before their reports.
  for (const u of seedUsers) {
    await prisma.user.create({
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        managerId: u.managerId,
        region: u.region,
        title: u.title,
        active: u.active !== false,
      },
    });
  }

  await prisma.target.createMany({
    data: Object.entries(seedTargets).map(([userId, amount]) => ({
      userId,
      monthlyPaise: paise(amount),
    })),
  });

  await prisma.campaign.createMany({
    data: seedCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      budgetPaise: paise(c.budget),
      spendPaise: c.spend != null ? paise(c.spend) : null,
      status: c.status,
      startDate: new Date(c.startDate),
      createdAt: new Date(c.createdAt),
    })),
  });

  await prisma.product.createMany({
    data: seedProducts.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      pricePaise: paise(p.price),
      active: p.active !== false,
    })),
  });

  await prisma.account.createMany({
    data: seedAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      industry: a.industry,
      city: a.city,
      website: a.website,
      ownerId: a.ownerId,
      archived: a.archived === true,
      createdAt: new Date(a.createdAt),
    })),
  });

  for (const l of seedLeads) {
    await prisma.lead.create({
      data: {
        id: l.id,
        name: l.name,
        company: l.company,
        phone: l.phone,
        email: l.email,
        source: l.source,
        status: l.status,
        ownerId: l.ownerId,
        estimatedPaise: paise(l.estimatedValue),
        notes: l.notes,
        campaignId: l.campaignId ?? null,
        pendingSync: l.pendingSync === true,
        createdAt: new Date(l.createdAt),
        updatedAt: new Date(l.updatedAt),
        attachments: l.attachments
          ? {
              create: l.attachments.map((att) => ({
                id: att.id,
                name: att.name,
                size: att.size,
                mimeType: att.type,
                dataUrl: att.dataUrl ?? null,
                uploaderId: att.uploaderId,
                uploadedAt: new Date(att.uploadedAt),
              })),
            }
          : undefined,
      },
    });
  }

  await prisma.contact.createMany({
    data: seedContacts.map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      title: c.title,
      phone: c.phone,
      email: c.email,
      ownerId: c.ownerId,
      leadId: c.leadId ?? null,
      accountId: c.accountId ?? null,
      archived: c.archived === true,
      createdAt: new Date(c.createdAt),
    })),
  });

  for (const d of seedDeals) {
    await prisma.deal.create({
      data: {
        id: d.id,
        title: d.title,
        contactId: d.contactId,
        ownerId: d.ownerId,
        stage: d.stage,
        valuePaise: paise(d.value),
        expectedClose: new Date(d.expectedClose),
        closedAt: d.closedAt ? new Date(d.closedAt) : null,
        lostReason: d.lostReason ?? null,
        archived: d.archived === true,
        createdAt: new Date(d.createdAt),
        lineItems: d.lineItems
          ? {
              create: d.lineItems.map((it) => ({
                productId: it.productId,
                qty: it.qty,
                pricePaise: paise(it.price),
              })),
            }
          : undefined,
      },
    });
  }

  await prisma.salesActivity.createMany({
    data: seedSalesActivities.map((a) => ({
      id: a.id,
      kind: a.kind,
      subject: a.subject,
      notes: a.notes,
      relatedType: a.relatedType,
      relatedId: a.relatedId,
      ownerId: a.ownerId,
      createdById: a.createdById ?? a.ownerId,
      dueAt: a.dueAt ? new Date(a.dueAt) : null,
      completedAt: a.completedAt ? new Date(a.completedAt) : null,
      lat: a.location?.lat ?? null,
      lng: a.location?.lng ?? null,
      createdAt: new Date(a.createdAt),
    })),
  });

  await prisma.notification.createMany({
    data: seedNotifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      message: n.message,
      href: n.href ?? null,
      read: n.read,
      createdAt: new Date(n.at),
    })),
  });

  await prisma.orgSettings.create({
    data: {
      id: 1,
      companyName: seedOrgSettings.companyName,
      addressLine: seedOrgSettings.addressLine,
      gstin: seedOrgSettings.gstin,
      quoteValidityDays: seedOrgSettings.quoteValidityDays,
      gstRateBps: Math.round(seedOrgSettings.gstRate * 10000),
      quoteTermsJson: JSON.stringify(seedOrgSettings.quoteTerms),
      quoteCounter: seedOrgSettings.quoteCounter,
    },
  });

  await prisma.stageSetting.createMany({
    data: (Object.keys(seedStageSettings) as DealStage[]).map((stage) => ({
      stage,
      label: seedStageSettings[stage].label,
      weightBps: Math.round(seedStageSettings[stage].weight * 10000),
    })),
  });

  const counts = {
    users: await prisma.user.count(),
    leads: await prisma.lead.count(),
    contacts: await prisma.contact.count(),
    accounts: await prisma.account.count(),
    deals: await prisma.deal.count(),
    lineItems: await prisma.dealLineItem.count(),
    activities: await prisma.salesActivity.count(),
    notifications: await prisma.notification.count(),
    products: await prisma.product.count(),
    campaigns: await prisma.campaign.count(),
  };
  console.log('Seeded:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
