import { describe, it, expect } from 'vitest';
import { orderMapsUrl, hasLivePoint } from './maps';

describe('orderMapsUrl', () => {
  it('returns exact coordinates URL when both lat and lng are present', () => {
    expect(orderMapsUrl({ lat: 31.47, lng: 74.3, address: 'Some Address' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=31.47,74.3');
  });

  it('falls back to address when coords are incomplete or invalid', () => {
    expect(orderMapsUrl({ lat: 31.47, address: 'Test Address' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=Test%20Address');
      
    expect(orderMapsUrl({ address: 'Test Address' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=Test%20Address');

    for (const bad of [{ lat: NaN, lng: 74.3 }, { lat: 91, lng: 74.3 }, { lat: 31.47, lng: 181 }, { lat: 0, lng: 0 }]) {
      expect(orderMapsUrl({ ...bad, address: 'Test Address' }))
        .toBe('https://www.google.com/maps/search/?api=1&query=Test%20Address');
    }
  });

  it('hasLivePoint is true only for a valid pin', () => {
    expect(hasLivePoint({ lat: 31.47, lng: 74.3 })).toBe(true);
    expect(hasLivePoint({ lat: 0, lng: 0 })).toBe(false);
    expect(hasLivePoint({ lat: null, lng: 74.3 })).toBe(false);
    expect(hasLivePoint({})).toBe(false);
  });

  it('returns null when nothing is present', () => {
    expect(orderMapsUrl({})).toBeNull();
    expect(orderMapsUrl({ lat: null, address: '   ' })).toBeNull();
  });
});
