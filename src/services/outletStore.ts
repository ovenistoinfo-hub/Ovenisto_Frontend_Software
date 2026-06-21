/**
 * Module-level holder for the currently active outlet id ("all" or an id).
 * OutletContext keeps this in sync; api.ts reads it on every request so the
 * active outlet is attached without threading it through every service call.
 */
let activeOutletId = 'all';

export const outletStore = {
  get: (): string => activeOutletId,
  set: (id: string): void => { activeOutletId = id || 'all'; },
};
