import { BadRequestException } from '@nestjs/common';

/**
 * Normalise a merchant-typed tracking URL before it reaches Shopify or the DB.
 *
 * Shopify rejects anything without a scheme at the GraphQL variable-coercion
 * layer (`Invalid url 'x', missing scheme`), which surfaced as an opaque 500.
 * Merchants routinely paste `track.courier.in/123`, so a missing scheme is
 * repaired with `https://`; anything that still is not an http(s) link with a
 * real host is a 400 the UI can show verbatim.
 *
 * Blank → null (clears the URL — the tracking endpoints are full replaces).
 */
export function normalizeTrackingUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw invalid(trimmed);
  }
  // `new URL('https://d')` parses fine, so require a dotted host too.
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    !parsed.hostname.includes('.') ||
    /\s/.test(trimmed)
  ) {
    throw invalid(trimmed);
  }
  return withScheme;
}

function invalid(value: string) {
  return new BadRequestException(
    `Tracking URL "${value}" is not a valid link. Enter a full address like https://courier.com/track/123, or leave it blank.`,
  );
}
