export interface WebsiteConfig {
  enabled: boolean;
  deliveryFee: number;
  freeDeliveryAbove: number | null;
  minOrder: number;
  prepTimeMinutes: number;
  reservationsEnabled: boolean;
  location: { lat: number; lng: number } | null;
}

function parseNumber(value: unknown, defaultValue: number): number {
  if (value == null) return defaultValue;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return defaultValue;
  return parsed;
}

function parseNumberNullable(value: unknown, defaultValue: number | null): number | null {
  if (value == null) return defaultValue;
  if (value === '') return defaultValue;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return defaultValue;
  return parsed;
}


export function parseLocation(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (!('lat' in obj) || !('lng' in obj)) return null;
  
  const lat = Number(obj.lat);
  const lng = Number(obj.lng);
  
  if (Number.isNaN(lat) || !Number.isFinite(lat)) return null;
  if (Number.isNaN(lng) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  
  return { lat, lng };
}

export function parseMapsLink(text: string): { ok: true; lat: number; lng: number } | { ok: false; reason: 'short_link' | 'not_found' } {
  if (!text) return { ok: false, reason: 'not_found' };
  
  // short link
  if (text.includes('maps.app.goo.gl') || text.includes('goo.gl/maps')) {
    return { ok: false, reason: 'short_link' };
  }

  // try rule b: !3d<lat>!4d<lng>
  let match = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (match) {
    const loc = parseLocation({ lat: match[1], lng: match[2] });
    if (loc) return { ok: true, ...loc };
  }

  // try rule c: @<lat>,<lng>
  match = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (match) {
    const loc = parseLocation({ lat: match[1], lng: match[2] });
    if (loc) return { ok: true, ...loc };
  }
  
  // try rule d: URL param q, query, ll, destination
  try {
    const url = new URL(text);
    for (const p of ['q', 'query', 'll', 'destination']) {
      const val = url.searchParams.get(p);
      if (val) {
        const parts = val.split(',');
        if (parts.length === 2) {
          const loc = parseLocation({ lat: parts[0], lng: parts[1] });
          if (loc) return { ok: true, ...loc };
        }
      }
    }
  } catch (e) {
    // not a valid URL, fallback
  }

  // try rule a: plain lat, lng
  match = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (match) {
    const loc = parseLocation({ lat: match[1], lng: match[2] });
    if (loc) return { ok: true, ...loc };
  }

  return { ok: false, reason: 'not_found' };
}

export function parseWebsiteConfig(raw: unknown): WebsiteConfig {
  const defaults: WebsiteConfig = {
    enabled: false,
    deliveryFee: 0,
    freeDeliveryAbove: null,
    minOrder: 0,
    prepTimeMinutes: 30,
    reservationsEnabled: false,
    location: null,
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;
  const enabled = obj.enabled === true || obj.enabled === 'true';
  const reservationsEnabled = obj.reservationsEnabled === true || obj.reservationsEnabled === 'true';

  let deliveryFee = defaults.deliveryFee;
  if ('deliveryFee' in obj) {
    deliveryFee = parseNumber(obj.deliveryFee, defaults.deliveryFee);
  } else if ('deliveryCharges' in obj) {
    deliveryFee = parseNumber(obj.deliveryCharges, defaults.deliveryFee);
  }

  const freeDeliveryAbove = parseNumberNullable(obj.freeDeliveryAbove, defaults.freeDeliveryAbove);
  const minOrder = parseNumber(obj.minOrder, defaults.minOrder);

  let prepTimeMinutes = defaults.prepTimeMinutes;
  if ('prepTimeMinutes' in obj) {
    prepTimeMinutes = parseNumber(obj.prepTimeMinutes, defaults.prepTimeMinutes);
  } else if ('prepTime' in obj) {
    prepTimeMinutes = parseNumber(obj.prepTime, defaults.prepTimeMinutes);
  }

  const location = parseLocation(obj.location);

  return { enabled, deliveryFee, freeDeliveryAbove, minOrder, prepTimeMinutes, reservationsEnabled, location };
}

export function buildWebsiteConfig(raw: unknown, form: WebsiteConfig): Record<string, unknown> {
  let base: Record<string, unknown> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    base = { ...raw } as Record<string, unknown>;
  }

  // delete legacy keys
  delete base.deliveryCharges;
  delete base.prepTime;
  delete base.deliveryRadius;
  delete base.autoAccept;

  // set canonical keys
  base.enabled = form.enabled;
  base.reservationsEnabled = form.reservationsEnabled;
  base.deliveryFee = form.deliveryFee;
  base.freeDeliveryAbove = form.freeDeliveryAbove;
  base.minOrder = form.minOrder;
  base.prepTimeMinutes = form.prepTimeMinutes;
  if (form.location) {
    base.location = form.location;
  } else {
    delete base.location;
  }

  return base;
}
