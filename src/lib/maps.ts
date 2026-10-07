// Google Maps link for a delivery: the exact live-location pin when the order has one, else a
// search for the typed address. Returns null when there is nothing to open.
function isValidPoint(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    && !(lat === 0 && lng === 0);
}

export function hasLivePoint(params: { lat?: number | null; lng?: number | null }): boolean {
  return isValidPoint(params.lat, params.lng);
}

export function orderMapsUrl(params: { lat?: number | null; lng?: number | null; address?: string | null }): string | null {
  if (isValidPoint(params.lat, params.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${params.lat},${params.lng}`;
  }
  if (params.address && params.address.trim() !== '') {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.address.trim())}`;
  }
  return null;
}
