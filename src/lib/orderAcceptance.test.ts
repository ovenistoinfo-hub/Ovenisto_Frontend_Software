import { describe, it, expect } from 'vitest';
import { isWebsiteOrder, isAwaitingAcceptance } from './orderAcceptance';

describe('orderAcceptance', () => {
  it('identifies website orders', () => {
    expect(isWebsiteOrder({ orderSource: 'website' })).toBe(true);
    expect(isWebsiteOrder({ orderSource: 'pos' })).toBe(false);
    expect(isWebsiteOrder({})).toBe(false);
  });

  it('identifies awaiting acceptance', () => {
    expect(isAwaitingAcceptance({ type: 'Self Order', status: 'pending' })).toBe(true);
    expect(isAwaitingAcceptance({ type: 'Self Order', status: 'accepted', acceptedById: '123' })).toBe(false);
    expect(isAwaitingAcceptance({ type: 'Delivery', orderSource: 'website', status: 'pending' })).toBe(true);
    expect(isAwaitingAcceptance({ type: 'Delivery', orderSource: 'website', status: 'cancelled' })).toBe(false);
    expect(isAwaitingAcceptance({ type: 'Delivery', orderSource: 'pos', status: 'pending' })).toBe(false);
  });
});

