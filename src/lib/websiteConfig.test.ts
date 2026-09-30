import { describe, it, expect } from 'vitest';
import { parseWebsiteConfig, buildWebsiteConfig } from './websiteConfig';

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
      
      const form = {
        enabled: true,
        reservationsEnabled: true,
        deliveryFee: 150,
        freeDeliveryAbove: null,
        minOrder: 500,
        prepTimeMinutes: 45,
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
    });
  });
});
