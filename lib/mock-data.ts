// Seed data for the MVP. Loaded into localStorage on first run; the app
// operates on the stored copy from then on (Reset demo data in the topbar
// restores this seed).

import {
  Account,
  Activity,
  AppNotification,
  AppState,
  Campaign,
  Contact,
  Deal,
  DealStage,
  Lead,
  OrgSettings,
  Product,
  SalesActivity,
  StageSetting,
  User,
} from './types';

function daysAgo(n: number, hourOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9 + hourOffset, 15, 0, 0);
  return d.toISOString();
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

export const seedUsers: User[] = [
  { id: 'u1', name: 'Arjun Mehta', email: 'arjun@salesforce.demo', role: 'admin', managerId: null, region: 'National', title: 'National Sales Head' },
  { id: 'u2', name: 'Priya Sharma', email: 'priya@salesforce.demo', role: 'regional_manager', managerId: 'u1', region: 'North', title: 'Regional Manager — North' },
  { id: 'u3', name: 'Vikram Rao', email: 'vikram@salesforce.demo', role: 'regional_manager', managerId: 'u1', region: 'South', title: 'Regional Manager — South' },
  { id: 'u4', name: 'Rahul Verma', email: 'rahul@salesforce.demo', role: 'team_lead', managerId: 'u2', region: 'North', title: 'Team Lead — Delhi NCR' },
  { id: 'u5', name: 'Divya Nair', email: 'divya@salesforce.demo', role: 'team_lead', managerId: 'u3', region: 'South', title: 'Team Lead — Bengaluru' },
  { id: 'u6', name: 'Sneha Kapoor', email: 'sneha@salesforce.demo', role: 'sales_rep', managerId: 'u4', region: 'North', title: 'Sales Rep' },
  { id: 'u7', name: 'Amit Singh', email: 'amit@salesforce.demo', role: 'sales_rep', managerId: 'u4', region: 'North', title: 'Sales Rep' },
  { id: 'u8', name: 'Karthik Iyer', email: 'karthik@salesforce.demo', role: 'sales_rep', managerId: 'u5', region: 'South', title: 'Sales Rep' },
  { id: 'u9', name: 'Meera Pillai', email: 'meera@salesforce.demo', role: 'sales_rep', managerId: 'u5', region: 'South', title: 'Sales Rep' },
];

export const seedLeads: Lead[] = [
  { id: 'l1', name: 'Rohit Malhotra', company: 'Malhotra Textiles', phone: '+91 98100 11223', email: 'rohit@malhotratextiles.in', source: 'website', status: 'new', ownerId: 'u6', estimatedValue: 250000, notes: 'Asked for bulk pricing on the enquiry form.', createdAt: daysAgo(1), updatedAt: daysAgo(1), attachments: [{ id: 'att1', name: 'bulk-pricing-enquiry-form.pdf', size: 184320, type: 'application/pdf', uploadedAt: daysAgo(1), uploaderId: 'u6' }] },
  { id: 'l2', name: 'Kavita Joshi', company: 'GreenLeaf Organics', phone: '+91 98220 44556', email: 'kavita@greenleaf.co.in', source: 'social_media', status: 'contacted', ownerId: 'u6', estimatedValue: 120000, notes: 'Responded to Instagram campaign. Call scheduled.', createdAt: daysAgo(3), updatedAt: daysAgo(2), campaignId: 'cam3' },
  { id: 'l3', name: 'Suresh Reddy', company: 'Reddy Constructions', phone: '+91 99490 77889', email: 'suresh@reddycon.com', source: 'field_visit', status: 'qualified', ownerId: 'u8', estimatedValue: 800000, notes: 'Met at site office. Needs proposal by month end.', createdAt: daysAgo(6), updatedAt: daysAgo(4), attachments: [{ id: 'att2', name: 'visiting-card-suresh-reddy.jpg', size: 96500, type: 'image/jpeg', uploadedAt: daysAgo(6), uploaderId: 'u8' }, { id: 'att3', name: 'site-requirements.xlsx', size: 42100, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uploadedAt: daysAgo(4), uploaderId: 'u8' }] },
  { id: 'l4', name: 'Anita Desai', company: 'Desai & Sons', phone: '+91 98330 22110', email: 'anita@desaisons.in', source: 'walk_in', status: 'contacted', ownerId: 'u7', estimatedValue: 90000, notes: 'Walked into Delhi showroom, comparing vendors.', createdAt: daysAgo(5), updatedAt: daysAgo(3) },
  { id: 'l5', name: 'Farhan Sheikh', company: 'FS Logistics', phone: '+91 99870 33445', email: 'farhan@fslogistics.in', source: 'email_campaign', status: 'new', ownerId: 'u7', estimatedValue: 300000, notes: 'Clicked through the Q3 fleet-services mailer.', createdAt: daysAgo(2), updatedAt: daysAgo(2), campaignId: 'cam2' },
  { id: 'l6', name: 'Lakshmi Menon', company: 'Menon Pharma', phone: '+91 98470 55667', email: 'lakshmi@menonpharma.com', source: 'event', status: 'qualified', ownerId: 'u9', estimatedValue: 450000, notes: 'Collected at Bengaluru trade expo booth.', createdAt: daysAgo(9), updatedAt: daysAgo(5), campaignId: 'cam1' },
  { id: 'l7', name: 'Deepak Chawla', company: 'Chawla Motors', phone: '+91 98110 66778', email: 'deepak@chawlamotors.in', source: 'phone', status: 'new', ownerId: 'u6', estimatedValue: 175000, notes: 'Inbound call asking about dealership terms.', createdAt: daysAgo(1, 3), updatedAt: daysAgo(1, 3) },
  { id: 'l8', name: 'Nisha Agarwal', company: 'Agarwal Retail', phone: '+91 93100 88990', email: 'nisha@agarwalretail.in', source: 'referral', status: 'contacted', ownerId: 'u7', estimatedValue: 220000, notes: 'Referred by existing client Desai & Sons.', createdAt: daysAgo(8), updatedAt: daysAgo(6) },
  { id: 'l9', name: 'Manoj Kumar', company: 'MK Enterprises', phone: '+91 90080 11224', email: 'manoj@mkent.in', source: 'marketplace', status: 'disqualified', ownerId: 'u8', estimatedValue: 60000, notes: 'Budget too small for the current catalogue.', createdAt: daysAgo(14), updatedAt: daysAgo(10) },
  { id: 'l10', name: 'Pooja Bhatt', company: 'Bhatt Interiors', phone: '+91 98200 33446', email: 'pooja@bhattinteriors.com', source: 'website', status: 'converted', ownerId: 'u9', estimatedValue: 350000, notes: 'Converted after demo. See deal.', createdAt: daysAgo(20), updatedAt: daysAgo(12) },
  { id: 'l11', name: 'Sanjay Gupta', company: 'Gupta Steels', phone: '+91 98390 55668', email: 'sanjay@guptasteels.in', source: 'event', status: 'converted', ownerId: 'u6', estimatedValue: 950000, notes: 'Expo lead, converted to opportunity.', createdAt: daysAgo(28), updatedAt: daysAgo(18), campaignId: 'cam1' },
  { id: 'l12', name: 'Ritu Saxena', company: 'Saxena Foods', phone: '+91 99530 77880', email: 'ritu@saxenafoods.in', source: 'social_media', status: 'new', ownerId: 'u9', estimatedValue: 140000, notes: 'DM enquiry about distribution tie-up.', createdAt: daysAgo(2, 4), updatedAt: daysAgo(2, 4), campaignId: 'cam3' },
  // Several contacts inside one buying company — a real pattern (different
  // people own budget, purchasing and the site), and what makes a task
  // covering a whole company worth scheduling.
  { id: 'l13', name: 'Neha Malhotra', company: 'Malhotra Textiles', phone: '+91 98100 11224', email: 'neha@malhotratextiles.in', source: 'phone', status: 'contacted', ownerId: 'u6', estimatedValue: 180000, notes: 'Finance head — handles payment terms for the bulk order.', createdAt: daysAgo(4), updatedAt: daysAgo(2) },
  { id: 'l14', name: 'Vikas Malhotra', company: 'Malhotra Textiles', phone: '+91 98100 11225', email: 'vikas@malhotratextiles.in', source: 'referral', status: 'new', ownerId: 'u6', estimatedValue: 210000, notes: 'Runs the second unit — wants a separate quote.', createdAt: daysAgo(3), updatedAt: daysAgo(3) },
  { id: 'l15', name: 'Anil Reddy', company: 'Reddy Constructions', phone: '+91 99490 77890', email: 'anil@reddycon.com', source: 'field_visit', status: 'contacted', ownerId: 'u8', estimatedValue: 320000, notes: 'Site engineer — technical sign-off on the proposal.', createdAt: daysAgo(5), updatedAt: daysAgo(3) },
];

export const seedAccounts: Account[] = [
  { id: 'ac1', name: 'Bhatt Interiors', industry: 'Interior Design', city: 'Mumbai', website: 'bhattinteriors.com', ownerId: 'u9', createdAt: daysAgo(12) },
  { id: 'ac2', name: 'Gupta Steels', industry: 'Manufacturing', city: 'Kanpur', website: 'guptasteels.in', ownerId: 'u6', createdAt: daysAgo(18) },
  { id: 'ac3', name: 'Chandra Distributors', industry: 'Distribution', city: 'Bengaluru', website: 'chandradist.in', ownerId: 'u8', createdAt: daysAgo(45) },
  { id: 'ac4', name: 'VR Hospitality', industry: 'Hospitality', city: 'Kochi', website: 'vrhospitality.in', ownerId: 'u9', createdAt: daysAgo(60) },
  { id: 'ac5', name: 'Qureshi Exports', industry: 'Export / Import', city: 'Mumbai', website: 'qureshiexports.com', ownerId: 'u7', createdAt: daysAgo(75) },
  { id: 'ac6', name: 'Iyengar Textile Mills', industry: 'Textiles', city: 'Coimbatore', website: 'iyengarmills.in', ownerId: 'u8', createdAt: daysAgo(90) },
  { id: 'ac7', name: 'Bansal Electronics', industry: 'Retail', city: 'New Delhi', website: 'bansalelec.in', ownerId: 'u6', createdAt: daysAgo(100) },
];

export const seedContacts: Contact[] = [
  { id: 'c1', name: 'Pooja Bhatt', company: 'Bhatt Interiors', accountId: 'ac1', title: 'Founder', phone: '+91 98200 33446', email: 'pooja@bhattinteriors.com', ownerId: 'u9', createdAt: daysAgo(12), leadId: 'l10' },
  { id: 'c2', name: 'Sanjay Gupta', company: 'Gupta Steels', accountId: 'ac2', title: 'Purchase Director', phone: '+91 98390 55668', email: 'sanjay@guptasteels.in', ownerId: 'u6', createdAt: daysAgo(18), leadId: 'l11' },
  { id: 'c3', name: 'Harish Chandra', company: 'Chandra Distributors', accountId: 'ac3', title: 'Managing Partner', phone: '+91 98450 99001', email: 'harish@chandradist.in', ownerId: 'u8', createdAt: daysAgo(45) },
  { id: 'c4', name: 'Vandana Rao', company: 'VR Hospitality', accountId: 'ac4', title: 'Procurement Head', phone: '+91 99000 22113', email: 'vandana@vrhospitality.in', ownerId: 'u9', createdAt: daysAgo(60) },
  { id: 'c5', name: 'Imran Qureshi', company: 'Qureshi Exports', accountId: 'ac5', title: 'CEO', phone: '+91 98190 44557', email: 'imran@qureshiexports.com', ownerId: 'u7', createdAt: daysAgo(75) },
  { id: 'c6', name: 'Geeta Iyengar', company: 'Iyengar Textile Mills', accountId: 'ac6', title: 'Director', phone: '+91 98860 66779', email: 'geeta@iyengarmills.in', ownerId: 'u8', createdAt: daysAgo(90) },
  { id: 'c7', name: 'Mohit Bansal', company: 'Bansal Electronics', accountId: 'ac7', title: 'Owner', phone: '+91 98710 88991', email: 'mohit@bansalelec.in', ownerId: 'u6', createdAt: daysAgo(100) },
  { id: 'c8', name: 'Ravi Chandra', company: 'Chandra Distributors', accountId: 'ac3', title: 'Operations Head', phone: '+91 98450 99002', email: 'ravi@chandradist.in', ownerId: 'u8', createdAt: daysAgo(30) },
];

// Every deal carries line items whose sum equals the deal value, so the
// quotation section is populated everywhere in the demo.
export const seedDeals: Deal[] = [
  { id: 'd1', title: 'Bhatt Interiors — Showroom fit-out order', contactId: 'c1', ownerId: 'u9', stage: 'proposal', value: 350000, expectedClose: daysAhead(20), createdAt: daysAgo(12), lineItems: [{ productId: 'p2', qty: 2, price: 120000 }, { productId: 'p3', qty: 1, price: 75000 }, { productId: 'p5', qty: 1, price: 35000 }] },
  { id: 'd2', title: 'Gupta Steels — Annual supply contract', contactId: 'c2', ownerId: 'u6', stage: 'negotiation', value: 950000, expectedClose: daysAhead(10), createdAt: daysAgo(18), lineItems: [{ productId: 'p1', qty: 3, price: 240000 }, { productId: 'p2', qty: 1, price: 120000 }, { productId: 'p3', qty: 1, price: 75000 }, { productId: 'p5', qty: 1, price: 35000 }] },
  { id: 'd3', title: 'Chandra Distributors — Q3 stock order', contactId: 'c3', ownerId: 'u8', stage: 'qualification', value: 280000, expectedClose: daysAhead(35), createdAt: daysAgo(7), lineItems: [{ productId: 'p2', qty: 1, price: 120000 }, { productId: 'p7', qty: 1, price: 90000 }, { productId: 'p5', qty: 2, price: 35000 }] },
  { id: 'd4', title: 'VR Hospitality — Linen supply', contactId: 'c4', ownerId: 'u9', stage: 'won', value: 420000, expectedClose: daysAgo(15), createdAt: daysAgo(50), closedAt: daysAgo(15), lineItems: [{ productId: 'p2', qty: 3, price: 120000 }, { productId: 'p4', qty: 1, price: 60000 }] },
  { id: 'd5', title: 'Qureshi Exports — Container order', contactId: 'c5', ownerId: 'u7', stage: 'won', value: 600000, expectedClose: daysAgo(40), createdAt: daysAgo(70), closedAt: daysAgo(40), lineItems: [{ productId: 'p1', qty: 2, price: 240000 }, { productId: 'p2', qty: 1, price: 120000 }] },
  { id: 'd6', title: 'Iyengar Mills — Machinery upgrade', contactId: 'c6', ownerId: 'u8', stage: 'lost', value: 480000, expectedClose: daysAgo(25), createdAt: daysAgo(80), closedAt: daysAgo(25), lostReason: 'Chose competitor on delivery time', lineItems: [{ productId: 'p1', qty: 2, price: 240000 }] },
  { id: 'd7', title: 'Bansal Electronics — Festive season stock', contactId: 'c7', ownerId: 'u6', stage: 'proposal', value: 330000, expectedClose: daysAhead(15), createdAt: daysAgo(9), lineItems: [{ productId: 'p2', qty: 2, price: 120000 }, { productId: 'p7', qty: 1, price: 90000 }] },
  { id: 'd8', title: 'VR Hospitality — Housekeeping refill', contactId: 'c4', ownerId: 'u9', stage: 'won', value: 180000, expectedClose: daysAgo(70), createdAt: daysAgo(95), closedAt: daysAgo(70), lineItems: [{ productId: 'p2', qty: 1, price: 120000 }, { productId: 'p4', qty: 1, price: 60000 }] },
  { id: 'd9', title: 'Chandra Distributors — Regional expansion', contactId: 'c3', ownerId: 'u8', stage: 'won', value: 750000, expectedClose: daysAgo(100), createdAt: daysAgo(130), closedAt: daysAgo(100), lineItems: [{ productId: 'p1', qty: 2, price: 240000 }, { productId: 'p2', qty: 2, price: 120000 }, { productId: 'p8', qty: 1, price: 30000 }] },
  { id: 'd10', title: 'Qureshi Exports — Repeat order', contactId: 'c5', ownerId: 'u7', stage: 'won', value: 540000, expectedClose: daysAgo(130), createdAt: daysAgo(160), closedAt: daysAgo(130), lineItems: [{ productId: 'p1', qty: 2, price: 240000 }, { productId: 'p4', qty: 1, price: 60000 }] },
  { id: 'd11', title: 'Bansal Electronics — Billing software rollout', contactId: 'c7', ownerId: 'u6', stage: 'won', value: 450000, expectedClose: daysAgo(3), createdAt: daysAgo(35), closedAt: daysAgo(3), lineItems: [{ productId: 'p1', qty: 1, price: 240000 }, { productId: 'p2', qty: 1, price: 120000 }, { productId: 'p7', qty: 1, price: 90000 }] },
  { id: 'd12', title: 'Iyengar Mills — Support renewal', contactId: 'c6', ownerId: 'u8', stage: 'won', value: 380000, expectedClose: daysAgo(8), createdAt: daysAgo(40), closedAt: daysAgo(8), lineItems: [{ productId: 'p2', qty: 2, price: 120000 }, { productId: 'p3', qty: 1, price: 75000 }, { productId: 'p5', qty: 1, price: 35000 }, { productId: 'p8', qty: 1, price: 30000 }] },
  { id: 'd13', title: 'Chandra Distributors — Warehouse automation pilot', contactId: 'c8', ownerId: 'u8', stage: 'proposal', value: 240000, expectedClose: daysAhead(18), createdAt: daysAgo(5), lineItems: [{ productId: 'p1', qty: 1, price: 240000 }] },
];

export const seedActivities: Activity[] = [
  { id: 'a1', type: 'lead_created', message: 'New website lead: Rohit Malhotra (Malhotra Textiles)', userId: 'u6', at: daysAgo(1) },
  { id: 'a2', type: 'deal_stage', message: 'Gupta Steels — Annual supply contract moved to Negotiation', userId: 'u6', at: daysAgo(2) },
  { id: 'a3', type: 'lead_status', message: 'Lakshmi Menon (Menon Pharma) marked Qualified', userId: 'u9', at: daysAgo(5) },
  { id: 'a4', type: 'deal_won', message: 'VR Hospitality — Linen supply closed Won at ₹4,20,000', userId: 'u9', at: daysAgo(15) },
  { id: 'a5', type: 'lead_converted', message: 'Pooja Bhatt converted to contact + deal', userId: 'u9', at: daysAgo(12) },
];

export const seedCampaigns: Campaign[] = [
  { id: 'cam1', name: 'Bengaluru Trade Expo 2026', channel: 'offline', budget: 200000, spend: 185000, status: 'active', startDate: daysAgo(30), createdAt: daysAgo(35) },
  { id: 'cam2', name: 'Q3 Fleet Services Mailer', channel: 'online', budget: 80000, spend: 42000, status: 'active', startDate: daysAgo(20), createdAt: daysAgo(22) },
  { id: 'cam3', name: 'Instagram Festive Push', channel: 'online', budget: 120000, spend: 95000, status: 'active', startDate: daysAgo(15), createdAt: daysAgo(16) },
];

export const seedProducts: Product[] = [
  { id: 'p1', name: 'Enterprise Suite — Annual Licence', sku: 'ENT-A-001', category: 'Software', price: 240000 },
  { id: 'p2', name: 'Business Suite — Annual Licence', sku: 'BUS-A-001', category: 'Software', price: 120000 },
  { id: 'p3', name: 'Onboarding & Implementation', sku: 'SRV-IMP-01', category: 'Services', price: 75000 },
  { id: 'p4', name: 'Premium Support (12 months)', sku: 'SUP-PRM-12', category: 'Support', price: 60000 },
  { id: 'p5', name: 'Training Workshop (per batch)', sku: 'SRV-TRN-01', category: 'Services', price: 35000 },
  { id: 'p6', name: 'Hardware Kit — Field Terminal', sku: 'HW-FT-100', category: 'Hardware', price: 48000 },
  { id: 'p7', name: 'Integration Add-on Pack', sku: 'ENT-ADD-03', category: 'Software', price: 90000 },
  { id: 'p8', name: 'Extended Warranty (24 months)', sku: 'SUP-WAR-24', category: 'Support', price: 30000 },
];

function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function daysAheadAt(n: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export const seedSalesActivities: SalesActivity[] = [
  // Overdue
  { id: 'sa1', kind: 'call', subject: 'Follow-up call on bulk pricing', notes: 'Promised revised numbers.', relatedType: 'lead', relatedId: 'l1', ownerId: 'u6', dueAt: daysAgo(1, 5), createdAt: daysAgo(2) },
  { id: 'sa2', kind: 'task', subject: 'Send proposal draft to Reddy Constructions', notes: '', relatedType: 'lead', relatedId: 'l3', ownerId: 'u8', createdById: 'u5', dueAt: daysAgo(2, 2), createdAt: daysAgo(5) },
  // Due today
  { id: 'sa3', kind: 'meeting', subject: 'Demo for GreenLeaf Organics', notes: 'Online demo, 30 min.', relatedType: 'lead', relatedId: 'l2', ownerId: 'u6', dueAt: todayAt(15, 30), createdAt: daysAgo(3) },
  { id: 'sa4', kind: 'call', subject: 'Negotiation call — Gupta Steels contract', notes: 'Decision maker joining.', relatedType: 'deal', relatedId: 'd2', ownerId: 'u6', dueAt: todayAt(17), createdAt: daysAgo(1) },
  { id: 'sa5', kind: 'email', subject: 'Share revised quotation with Bhatt Interiors', notes: '', relatedType: 'deal', relatedId: 'd1', ownerId: 'u9', dueAt: todayAt(12), createdAt: daysAgo(1) },
  // Upcoming
  { id: 'sa6', kind: 'meeting', subject: 'Site visit — Menon Pharma warehouse', notes: 'Carry brochures.', relatedType: 'lead', relatedId: 'l6', ownerId: 'u9', dueAt: daysAheadAt(2, 11), createdAt: daysAgo(4) },
  { id: 'sa7', kind: 'call', subject: 'Check in with Chandra Distributors', notes: '', relatedType: 'deal', relatedId: 'd3', ownerId: 'u8', dueAt: daysAheadAt(3, 10), createdAt: daysAgo(2) },
  { id: 'sa8', kind: 'task', subject: 'Prepare festive-season stock quote', notes: '', relatedType: 'deal', relatedId: 'd7', ownerId: 'u6', createdById: 'u4', dueAt: daysAheadAt(4, 16), createdAt: daysAgo(1) },
  // Completed
  { id: 'sa9', kind: 'call', subject: 'Qualification call with FS Logistics', notes: 'Interested, needs board sign-off.', relatedType: 'lead', relatedId: 'l5', ownerId: 'u7', dueAt: daysAgo(3, 3), completedAt: daysAgo(3, 4), createdAt: daysAgo(4) },
  { id: 'sa10', kind: 'meeting', subject: 'Kick-off with VR Hospitality', notes: 'Linen supply schedule agreed.', relatedType: 'contact', relatedId: 'c4', ownerId: 'u9', dueAt: daysAgo(14, 2), completedAt: daysAgo(14, 3), createdAt: daysAgo(16) },
  // Amit Singh (u7) — working list
  { id: 'sa11', kind: 'call', subject: 'Intro call with FS Logistics ops team', notes: 'Walk through fleet-services scope.', relatedType: 'lead', relatedId: 'l5', ownerId: 'u7', dueAt: todayAt(16), createdAt: daysAgo(1) },
  { id: 'sa12', kind: 'task', subject: 'Send catalogue to Agarwal Retail', notes: '', relatedType: 'lead', relatedId: 'l8', ownerId: 'u7', createdById: 'u4', dueAt: daysAheadAt(2, 12), createdAt: daysAgo(2) },
  // Managers — their own follow-ups
  { id: 'sa13', kind: 'meeting', subject: 'Pipeline review — North team', notes: 'Focus on Gupta Steels negotiation.', relatedType: 'deal', relatedId: 'd2', ownerId: 'u4', dueAt: todayAt(18), createdAt: daysAgo(1) },
  { id: 'sa14', kind: 'task', subject: 'Approve Bhatt Interiors discount request', notes: '8% requested by Meera.', relatedType: 'deal', relatedId: 'd1', ownerId: 'u5', createdById: 'u3', dueAt: daysAheadAt(1, 10), createdAt: daysAgo(1) },
  { id: 'sa15', kind: 'call', subject: 'Join Gupta Steels negotiation call', notes: '', relatedType: 'deal', relatedId: 'd2', ownerId: 'u2', dueAt: daysAheadAt(1, 17), createdAt: daysAgo(1) },
  { id: 'sa16', kind: 'meeting', subject: 'South region quarterly business review', notes: '', relatedType: 'deal', relatedId: 'd3', ownerId: 'u3', dueAt: daysAheadAt(4, 10), createdAt: daysAgo(3) },
  { id: 'sa17', kind: 'task', subject: 'Monthly sales update for the board', notes: 'Pull numbers from Reports.', relatedType: 'deal', relatedId: 'd2', ownerId: 'u1', dueAt: daysAheadAt(3, 9), createdAt: daysAgo(2) },
  // Notes & history on remaining leads
  { id: 'sa18', kind: 'note', subject: 'Walk-in enquiry captured at Delhi showroom', notes: 'Comparing vendors, decision in 2 weeks.', relatedType: 'lead', relatedId: 'l4', ownerId: 'u7', createdAt: daysAgo(4) },
  { id: 'sa19', kind: 'call', subject: 'Discussed dealership terms', notes: 'Positive — wants written proposal.', relatedType: 'lead', relatedId: 'l7', ownerId: 'u6', dueAt: daysAgo(1, 2), completedAt: daysAgo(1, 3), createdAt: daysAgo(2) },
  { id: 'sa20', kind: 'note', subject: 'Referred by Anita Desai — warm intro', notes: '', relatedType: 'lead', relatedId: 'l8', ownerId: 'u7', createdAt: daysAgo(7) },
  { id: 'sa21', kind: 'meeting', subject: 'Site visit — pilot scope with Ravi Chandra', notes: 'Warehouse automation pilot agreed in principle.', relatedType: 'deal', relatedId: 'd13', ownerId: 'u8', dueAt: daysAgo(2, 1), completedAt: daysAgo(2, 2), createdAt: daysAgo(3), location: { lat: 12.97194, lng: 77.59369 } },
  // History on closed deals so no timeline is empty
  { id: 'sa22', kind: 'meeting', subject: 'Final linen supply schedule sign-off', notes: '', relatedType: 'deal', relatedId: 'd4', ownerId: 'u9', dueAt: daysAgo(16, 2), completedAt: daysAgo(16, 3), createdAt: daysAgo(18) },
  { id: 'sa23', kind: 'call', subject: 'Container pricing agreed', notes: 'Confirmed 2 enterprise licences + business suite.', relatedType: 'deal', relatedId: 'd5', ownerId: 'u7', dueAt: daysAgo(42), completedAt: daysAgo(42), createdAt: daysAgo(45) },
  { id: 'sa24', kind: 'note', subject: 'Lost to competitor on delivery time', notes: 'Revisit next fiscal — relationship intact.', relatedType: 'deal', relatedId: 'd6', ownerId: 'u8', createdAt: daysAgo(25) },
  { id: 'sa25', kind: 'email', subject: 'Email: Housekeeping refill invoice sent', notes: 'To vandana@vrhospitality.in', relatedType: 'deal', relatedId: 'd8', ownerId: 'u9', dueAt: daysAgo(70), completedAt: daysAgo(70), createdAt: daysAgo(70) },
  { id: 'sa26', kind: 'meeting', subject: 'Expansion rollout kick-off', notes: '', relatedType: 'deal', relatedId: 'd9', ownerId: 'u8', dueAt: daysAgo(99), completedAt: daysAgo(99), createdAt: daysAgo(101) },
  { id: 'sa27', kind: 'call', subject: 'Repeat order confirmed on call', notes: '', relatedType: 'deal', relatedId: 'd10', ownerId: 'u7', dueAt: daysAgo(131), completedAt: daysAgo(131), createdAt: daysAgo(133) },
  { id: 'sa28', kind: 'call', subject: 'Billing rollout go-live confirmed', notes: '', relatedType: 'deal', relatedId: 'd11', ownerId: 'u6', dueAt: daysAgo(4), completedAt: daysAgo(4), createdAt: daysAgo(6) },
  { id: 'sa29', kind: 'email', subject: 'Email: Support renewal terms', notes: 'To geeta@iyengarmills.in — renewal at same rates.', relatedType: 'deal', relatedId: 'd12', ownerId: 'u8', dueAt: daysAgo(10), completedAt: daysAgo(10), createdAt: daysAgo(11) },
  // History on remaining leads
  { id: 'sa30', kind: 'note', subject: 'Disqualified — budget below catalogue minimum', notes: '', relatedType: 'lead', relatedId: 'l9', ownerId: 'u8', createdAt: daysAgo(10) },
  { id: 'sa31', kind: 'meeting', subject: 'Product demo before conversion', notes: 'Demo went well — converted to deal.', relatedType: 'lead', relatedId: 'l10', ownerId: 'u9', dueAt: daysAgo(13, 2), completedAt: daysAgo(13, 3), createdAt: daysAgo(15) },
  { id: 'sa32', kind: 'note', subject: 'Collected at expo booth, high intent', notes: '', relatedType: 'lead', relatedId: 'l11', ownerId: 'u6', createdAt: daysAgo(28) },
  { id: 'sa33', kind: 'task', subject: 'Reply to distribution tie-up DM', notes: '', relatedType: 'lead', relatedId: 'l12', ownerId: 'u9', createdById: 'u5', dueAt: daysAheadAt(1, 11), createdAt: daysAgo(1) },
];

export const seedNotifications: AppNotification[] = [
  { id: 'n1', userId: 'u6', message: 'New lead assigned to you: Deepak Chawla (Chawla Motors)', at: daysAgo(1, 3), read: false },
  { id: 'n2', userId: 'u4', message: 'Sneha Kapoor moved “Gupta Steels — Annual supply contract” to Negotiation', at: daysAgo(2), read: false },
  { id: 'n3', userId: 'u5', message: 'Meera Pillai closed “VR Hospitality — Linen supply” — Won at ₹4,20,000', at: daysAgo(15), read: true },
  { id: 'n4', userId: 'u8', message: 'New lead assigned to you: Suresh Reddy (Reddy Constructions)', at: daysAgo(6), read: true },
  { id: 'n5', userId: 'u1', message: 'North region: Sneha Kapoor closed “Bansal Electronics — Billing software rollout” — Won at ₹4,50,000', at: daysAgo(3), read: false },
  { id: 'n6', userId: 'u2', message: 'Sneha Kapoor closed “Bansal Electronics — Billing software rollout” — Won at ₹4,50,000', at: daysAgo(3), read: false },
  { id: 'n7', userId: 'u3', message: 'Karthik Iyer closed “Iyengar Mills — Support renewal” — Won at ₹3,80,000', at: daysAgo(8), read: false },
  { id: 'n8', userId: 'u7', message: 'New lead assigned to you: Farhan Sheikh (FS Logistics)', at: daysAgo(2), read: false },
  { id: 'n9', userId: 'u9', message: 'New lead assigned to you: Ritu Saxena (Saxena Foods)', at: daysAgo(2, 4), read: false },
];

// Monthly revenue quota per user. Manager quotas are rolled-up team numbers.
export const seedTargets: Record<string, number> = {
  u1: 5000000,
  u2: 2200000,
  u3: 2600000,
  u4: 2200000,
  u5: 2600000,
  u6: 1100000,
  u7: 1100000,
  u8: 1300000,
  u9: 1300000,
};

export const seedOrgSettings: OrgSettings = {
  companyName: 'SalesForce Demo Pvt. Ltd.',
  addressLine: '123 Business Park, Bengaluru 560001',
  gstin: '29ABCDE1234F1Z5',
  quoteValidityDays: 15,
  gstRate: 0.18,
  quoteTerms: [
    'Prices valid for the stated validity period from the quotation date.',
    'Delivery within 3–4 weeks of confirmed purchase order.',
    'Payment: 50% advance, balance on delivery.',
  ],
  quoteCounter: 1,
};

export const seedStageSettings: Record<DealStage, StageSetting> = {
  qualification: { label: 'Cold', weight: 0.3 },
  proposal: { label: 'Warm', weight: 0.5 },
  negotiation: { label: 'Hot', weight: 0.75 },
  won: { label: 'Order Secured', weight: 1 },
  lost: { label: 'Order Lost', weight: 0 },
};

export function buildSeedState(): AppState {
  return {
    users: seedUsers,
    leads: seedLeads,
    contacts: seedContacts,
    accounts: seedAccounts,
    campaigns: seedCampaigns,
    deals: seedDeals,
    activities: seedActivities,
    salesActivities: seedSalesActivities,
    products: seedProducts,
    notifications: seedNotifications,
    quotes: [],
    orgSettings: seedOrgSettings,
    stageSettings: seedStageSettings,
    targets: seedTargets,
    autoAssignCounter: 0,
    onboardingDismissed: {},
    currentUserId: null,
  };
}
