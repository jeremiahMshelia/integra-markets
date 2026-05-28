const POLYMARKET_EVENT_BASE = 'https://polymarket.com/event/';

const OFFICIAL_POLYMARKET_HOSTS = new Set([
  'polymarket.com',
  'www.polymarket.com',
]);

const parseUrl = (value) => {
  if (!value || typeof value !== 'string') return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const isOfficialPolymarketEventUrl = (value) => {
  const parsed = parseUrl(value);
  if (!parsed) return false;

  return OFFICIAL_POLYMARKET_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith('/event/');
};

export const buildPolymarketEventUrl = (slug) => {
  if (!slug || typeof slug !== 'string') return null;

  const normalizedSlug = slug
    .trim()
    .replace(/^\/+/, '')
    .replace(/^event\//, '')
    .replace(/\/+$/, '');

  if (!normalizedSlug) return null;

  return `${POLYMARKET_EVENT_BASE}${normalizedSlug}`;
};

export const extractPolymarketSlug = (item = {}) => {
  const explicitCandidates = [
    item.eventSlug,
    item.event_slug,
    item.slug,
    item.polymarketSlug,
    item.polymarket_slug,
    item.polymarketContext?.slug,
    item.polymarket_context?.slug,
  ];

  for (const candidate of explicitCandidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const urlCandidates = [
    item.eventUrl,
    item.event_url,
    item.polymarketUrl,
    item.polymarket_url,
    item.sourceUrl,
    item.source_url,
    item.url,
  ];

  for (const candidate of urlCandidates) {
    const parsed = parseUrl(candidate);
    if (!parsed) continue;
    if (!OFFICIAL_POLYMARKET_HOSTS.has(parsed.hostname)) continue;
    if (!parsed.pathname.startsWith('/event/')) continue;

    const slug = parsed.pathname.replace(/^\/event\//, '').replace(/\/+$/, '');
    if (slug) return slug;
  }

  return null;
};

export const getPreferredSourceUrl = (item = {}) => {
  const source = item.source?.toLowerCase?.();

  if (source === 'polymarket') {
    const explicitUrlCandidates = [
      item.eventUrl,
      item.event_url,
      item.polymarketUrl,
      item.polymarket_url,
      item.sourceUrl,
      item.source_url,
      item.url,
    ];

    for (const candidate of explicitUrlCandidates) {
      if (isOfficialPolymarketEventUrl(candidate)) {
        return candidate;
      }
    }

    const slug = extractPolymarketSlug(item);
    if (slug) {
      return buildPolymarketEventUrl(slug);
    }

    return null;
  }

  const genericSourceUrl = item.sourceUrl || item.source_url || item.url || null;
  return genericSourceUrl && genericSourceUrl !== '#' ? genericSourceUrl : null;
};
