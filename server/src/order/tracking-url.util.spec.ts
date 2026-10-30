import { BadRequestException } from '@nestjs/common';
import { normalizeTrackingUrl } from './tracking-url.util';

describe('normalizeTrackingUrl', () => {
  it('treats blank as no URL', () => {
    expect(normalizeTrackingUrl(undefined)).toBeNull();
    expect(normalizeTrackingUrl(null)).toBeNull();
    expect(normalizeTrackingUrl('   ')).toBeNull();
  });

  it('keeps a full http(s) URL as typed (trimmed)', () => {
    expect(normalizeTrackingUrl(' https://www.delhivery.com/track/package/123 ')).toBe(
      'https://www.delhivery.com/track/package/123',
    );
    expect(normalizeTrackingUrl('http://track.example.in/?awb=9')).toBe(
      'http://track.example.in/?awb=9',
    );
  });

  it('adds https:// when the scheme is missing', () => {
    expect(normalizeTrackingUrl('track.courier.in/123')).toBe('https://track.courier.in/123');
  });

  it.each(['d', 'not a url', 'ftp://files.example.com/x', 'https://localhost', 'https://'])(
    'rejects %p with a 400',
    (input) => {
      expect(() => normalizeTrackingUrl(input)).toThrow(BadRequestException);
    },
  );

  it('names the bad value in the message', () => {
    expect(() => normalizeTrackingUrl('d')).toThrow(/Tracking URL "d" is not a valid link/);
  });
});
