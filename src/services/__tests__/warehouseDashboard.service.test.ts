import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warehouseDashboardService } from '../warehouseDashboard.service';
import { api } from '../api';

vi.mock('../api', () => {
  return {
    api: {
      get: vi.fn(),
    },
  };
});

describe('warehouseDashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls api.get with options containing X-Outlet-Id header when bypassGlobalOutlet is true', async () => {
    const mockData = { success: true, data: { activeWarehouses: [] } };
    vi.mocked(api.get).mockResolvedValue(mockData);

    const result = await warehouseDashboardService.getStats({
      bypassGlobalOutlet: true,
    });

    expect(api.get).toHaveBeenCalledWith(
      '/warehouses/dashboard-stats',
      { headers: { 'X-Outlet-Id': 'all' } }
    );
    expect(result).toEqual({ activeWarehouses: [] });
  });

  it('calls api.get without custom headers when bypassGlobalOutlet is false or undefined', async () => {
    const mockData = { success: true, data: { activeWarehouses: [] } };
    vi.mocked(api.get).mockResolvedValue(mockData);

    await warehouseDashboardService.getStats({
      bypassGlobalOutlet: false,
    });

    expect(api.get).toHaveBeenCalledWith(
      '/warehouses/dashboard-stats',
      {}
    );

    await warehouseDashboardService.getStats();

    expect(api.get).toHaveBeenLastCalledWith(
      '/warehouses/dashboard-stats',
      {}
    );
  });
});
