import { describe, it, expect, beforeEach } from 'vitest';
import { outletStore } from '../outletStore';

describe('outletStore', () => {
  beforeEach(() => outletStore.set('all'));

  it('defaults to "all"', () => {
    expect(outletStore.get()).toBe('all');
  });

  it('set then get returns the new value', () => {
    outletStore.set('o1');
    expect(outletStore.get()).toBe('o1');
  });
});
