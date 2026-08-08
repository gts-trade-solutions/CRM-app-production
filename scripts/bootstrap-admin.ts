// Creates the first administrator on an empty production database — the one
// account that cannot be invited, because there is nobody to invite it.
// Everyone else is added through the app and sets their own password.
//
//   ADMIN_NAME="Priya Sharma" ADMIN_EMAIL=priya@acme.com \
//   ADMIN_PASSWORD='...' npm run bootstrap:admin
//
// Refuses to run if an admin already exists, so it cannot be used to mint a
// second one against a live system.

import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}.`);
    console.error(
      'Usage: ADMIN_NAME="Full Name" ADMIN_EMAIL=you@company.com ADMIN_PASSWORD=... npm run bootstrap:admin',
    );
    process.exit(1);
  }
  return value;
}

async function main() {
  const name = required('ADMIN_NAME');
  const email = required('ADMIN_EMAIL').toLowerCase();
  const password = required('ADMIN_PASSWORD');

  if (password.length < 10) {
    console.error('ADMIN_PASSWORD must be at least 10 characters.');
    process.exit(1);
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'admin', active: true },
  });
  if (existingAdmin) {
    console.error(
      `An active administrator already exists (${existingAdmin.email}).`,
    );
    console.error('Add further members from the Team page inside the app.');
    process.exit(1);
  }

  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash) {
    console.error(`${email} is already registered.`);
    process.exit(1);
  }

  const admin = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: hashSync(password, 10),
      role: 'admin',
      managerId: null,
      region: process.env.ADMIN_REGION?.trim() || 'National',
      title: process.env.ADMIN_TITLE?.trim() || 'Administrator',
    },
  });

  // Org settings are a singleton the quotation pages read, and the stage rows
  // back the pipeline vocabulary and forecast weights. Both are edited in
  // Admin, but the rows have to exist first — PATCH updates them, it does not
  // create them, so a fresh database needs them written here.
  await prisma.orgSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyName: process.env.ORG_NAME?.trim() || name,
      addressLine:
        process.env.ORG_ADDRESS?.trim() || 'Set your address in Admin',
      gstin: process.env.ORG_GSTIN?.trim() || '',
      quoteTermsJson: JSON.stringify([
        'Prices are exclusive of taxes unless stated otherwise.',
        'Delivery timelines confirmed on order acceptance.',
      ]),
    },
  });

  const stages = [
    { stage: 'qualification', label: 'Cold', weightBps: 3000 },
    { stage: 'proposal', label: 'Warm', weightBps: 5000 },
    { stage: 'negotiation', label: 'Hot', weightBps: 7500 },
    { stage: 'won', label: 'Order Secured', weightBps: 10000 },
    { stage: 'lost', label: 'Order Lost', weightBps: 0 },
  ] as const;
  for (const s of stages) {
    await prisma.stageSetting.upsert({
      where: { stage: s.stage },
      update: {},
      create: s,
    });
  }

  await prisma.auditEvent.create({
    data: {
      type: 'admin_bootstrapped',
      message: `${admin.name} created as the first administrator`,
      actorId: admin.id,
      entity: `user:${admin.id}`,
    },
  });

  console.log(`Created administrator ${admin.email}.`);
  console.log('Sign in, then add your team from the Team page.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
