import { describe, expect, it } from 'vitest';
import { leadScore, scoreTier } from '@/lib/scoring';
import { Lead } from '@/lib/types';

function makeLead(overrides: Partial<Lead>): Lead {
  return {
    id: 'l',
    name: 'Test',
    company: 'Co',
    phone: '+91 90000 00000',
    email: 't@co.in',
    source: 'website',
    status: 'new',
    ownerId: 'u1',
    estimatedValue: 0,
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('lead scoring', () => {
  it('stays within 0–100', () => {
    const maxed = makeLead({
      source: 'referral',
      estimatedValue: 10_000_000,
      status: 'qualified',
    });
    expect(leadScore(maxed, 10)).toBeLessThanOrEqual(100);
    const cold = makeLead({
      source: 'social_media',
      updatedAt: new Date(Date.now() - 90 * 86400_000).toISOString(),
    });
    expect(leadScore(cold, 0)).toBeGreaterThanOrEqual(0);
  });

  it('a fresh, qualified, high-value referral outranks a stale social lead', () => {
    const hot = makeLead({
      source: 'referral',
      estimatedValue: 800_000,
      status: 'qualified',
    });
    const cold = makeLead({
      source: 'social_media',
      estimatedValue: 10_000,
      updatedAt: new Date(Date.now() - 60 * 86400_000).toISOString(),
    });
    expect(leadScore(hot, 3)).toBeGreaterThan(leadScore(cold, 0));
  });

  it('engagement contributes but is capped', () => {
    const base = makeLead({});
    expect(leadScore(base, 3) - leadScore(base, 0)).toBe(15);
    expect(leadScore(base, 10)).toBe(leadScore(base, 3));
  });

  it('tiers map to the pipeline vocabulary', () => {
    expect(scoreTier(85).label).toBe('Hot');
    expect(scoreTier(50).label).toBe('Warm');
    expect(scoreTier(20).label).toBe('Cold');
  });
});
