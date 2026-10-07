import { describe, it, expect } from 'vitest';
import { parseWebsiteConfig, buildWebsiteConfig, WebsiteConfig, parseLocation, parseMapsLink } from './websiteConfig';

describe('websiteConfig', () => {
  describe('parseWebsiteConfig', () => {
    it('handles seed shape', () => {
      const parsed = parseWebsiteConfig({});
      expect(parsed).toEqual({
        enabled: false,
        reservationsEnabled: false,
        deliveryFee: 0,
        freeDeliveryAbove: null,
        minOrder: 0,
        prepTimeMinutes: 30,
        location: null,
      });
    });

    it('handles legacy string shape', () => {
      const parsed = parseWebsiteConfig({
        enabled: 'true',
        deliveryCharges: '150',
        prepTime: '45',
      });
      expect(parsed).toEqual(expect.objectContaining({
        enabled: true,
        deliveryFee: 150,
        prepTimeMinutes: 45,
      }));
    });

    it('canonical wins over legacy', () => {
      const parsed = parseWebsiteConfig({
        deliveryFee: 100,
        deliveryCharges: 200,
        prepTimeMinutes: 20,
        prepTime: 40,
      });
      expect(parsed).toEqual(expect.objectContaining({
        deliveryFee: 100,
        prepTimeMinutes: 20,
      }));
    });

    it('handles garbage input', () => {
      const garbage1 = parseWebsiteConfig(null);
      const garbage2 = parseWebsiteConfig('not-an-object');
      const garbage3 = parseWebsiteConfig({ deliveryFee: -10, prepTimeMinutes: 'abc' });
      
      expect(garbage1.deliveryFee).toBe(0);
      expect(garbage2.deliveryFee).toBe(0);
      expect(garbage3.deliveryFee).toBe(0); // negative goes to default
      expect(garbage3.prepTimeMinutes).toBe(30); // NaN goes to default
    });
  });

  describe('buildWebsiteConfig', () => {
    it('drops legacy keys but keeps unrelated keys and sets new form', () => {
      const raw = {
        deliveryCharges: 100,
        prepTime: 40,
        deliveryRadius: 5,
        autoAccept: true,
        someUnrelatedKey: 'hello',
      };
      
      const form: WebsiteConfig = {
        enabled: true,
        reservationsEnabled: true,
        deliveryFee: 150,
        freeDeliveryAbove: null,
        minOrder: 500,
        prepTimeMinutes: 45,
        location: null,
      };

      const built = buildWebsiteConfig(raw, form);

      expect(built).toEqual({
        someUnrelatedKey: 'hello',
        enabled: true,
        reservationsEnabled: true,
        deliveryFee: 150,
        freeDeliveryAbove: null,
        minOrder: 500,
        prepTimeMinutes: 45,
      });

      expect('deliveryCharges' in built).toBe(false);
      expect('prepTime' in built).toBe(false);
      expect('deliveryRadius' in built).toBe(false);
      expect('autoAccept' in built).toBe(false);
      expect('location' in built).toBe(false);
    });

    it('writes location when non-null', () => {
      const raw = {};
      const form: WebsiteConfig = {
        enabled: true,
        reservationsEnabled: true,
        deliveryFee: 150,
        freeDeliveryAbove: null,
        minOrder: 500,
        prepTimeMinutes: 45,
        location: { lat: 31.47, lng: 74.3 },
      };

      const built = buildWebsiteConfig(raw, form);
      expect(built.location).toEqual({ lat: 31.47, lng: 74.3 });
    });
  });
});

describe('parseLocation', () => {
  it('parses valid object', () => {
    expect(parseLocation({ lat: 31.47, lng: 74.3 })).toEqual({ lat: 31.47, lng: 74.3 });
  });
  it('parses numeric strings', () => {
    expect(parseLocation({ lat: "31.47", lng: "74.3" })).toEqual({ lat: 31.47, lng: 74.3 });
  });
  it('rejects out of range', () => {
    expect(parseLocation({ lat: 91, lng: 0 })).toBeNull();
    expect(parseLocation({ lat: 0, lng: 181 })).toBeNull();
  });
  it('rejects (0,0)', () => {
    expect(parseLocation({ lat: 0, lng: 0 })).toBeNull();
  });
  it('rejects missing or garbage', () => {
    expect(parseLocation(null)).toBeNull();
    expect(parseLocation("string")).toBeNull();
    expect(parseLocation(123)).toBeNull();
    expect(parseLocation([])).toBeNull();
    expect(parseLocation({ lat: 31 })).toBeNull();
  });
});

describe('parseMapsLink', () => {
  it('returns short_link for short URLs', () => {
    expect(parseMapsLink('https://maps.app.goo.gl/abcdefg')).toEqual({ ok: false, reason: 'short_link' });
    expect(parseMapsLink('https://goo.gl/maps/123')).toEqual({ ok: false, reason: 'short_link' });
  });
  
  it('parses plain lat, lng (Rule a)', () => {
    expect(parseMapsLink('31.47, 74.3')).toEqual({ ok: true, lat: 31.47, lng: 74.3 });
    expect(parseMapsLink('31.47,74.3')).toEqual({ ok: true, lat: 31.47, lng: 74.3 });
  });

  it('parses !3d<lat>!4d<lng> (Rule b) over @<lat>,<lng> (Rule c)', () => {
    expect(parseMapsLink('https://www.google.com/maps/place/SomePlace/@31.0,74.0,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d31.47!4d74.3!16s%2Fm%2F012345')).toEqual({ ok: true, lat: 31.47, lng: 74.3 });
  });

  it('parses @<lat>,<lng> (Rule c)', () => {
    expect(parseMapsLink('https://www.google.com/maps/@31.47,74.3,15z')).toEqual({ ok: true, lat: 31.47, lng: 74.3 });
  });

  it('parses q, query, ll, destination (Rule d)', () => {
    expect(parseMapsLink('https://www.google.com/maps?q=31.47,74.3')).toEqual({ ok: true, lat: 31.47, lng: 74.3 });
    expect(parseMapsLink('https://maps.google.com/?ll=31.47,74.3')).toEqual({ ok: true, lat: 31.47, lng: 74.3 });
  });
  
  it('returns not_found for junk', () => {
    expect(parseMapsLink('not a map link')).toEqual({ ok: false, reason: 'not_found' });
  });
});
