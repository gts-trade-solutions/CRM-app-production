import { describe, expect, it } from 'vitest';
import { formatINR, parseCsv, whatsappLink } from '@/lib/utils';

describe('INR formatting', () => {
  it('uses lakh/crore grouping', () => {
    expect(formatINR(450000)).toContain('4,50,000');
    expect(formatINR(10000000)).toContain('1,00,00,000');
  });
});

describe('WhatsApp links', () => {
  it('prefixes 91 for bare 10-digit Indian numbers', () => {
    expect(whatsappLink('98100 11223')).toBe('https://wa.me/919810011223');
  });
  it('keeps numbers that already carry a country code', () => {
    expect(whatsappLink('+91 98100 11223')).toBe(
      'https://wa.me/919810011223',
    );
  });
  it('encodes the prefilled message', () => {
    expect(whatsappLink('+91 98100 11223', 'Hi there')).toContain(
      '?text=Hi%20there',
    );
  });
});

describe('CSV parsing', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv(
      'name,notes\n"Sharma, Rohit","Said ""call later"""\nAmit,plain',
    );
    expect(rows).toEqual([
      ['name', 'notes'],
      ['Sharma, Rohit', 'Said "call later"'],
      ['Amit', 'plain'],
    ]);
  });

  it('handles CRLF and skips blank lines', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});
