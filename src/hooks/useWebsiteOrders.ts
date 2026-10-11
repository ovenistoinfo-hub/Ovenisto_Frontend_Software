import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orderService } from '@/services/order.service';
import { isAwaitingAcceptance } from '@/lib/orderAcceptance';
import { useAuth } from '@/contexts/AuthContext';

export function useWebsiteOrders() {
  const { hasPermission } = useAuth();
  const enabled = hasPermission('website-orders');
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: ['website-orders', 'pending'],
    queryFn: async () => {
      const res = await orderService.getOrders({ orderSource: 'website', status: 'pending', limit: 100 });
      return (res.data || []).filter(isAwaitingAcceptance);
    },
    enabled,
  });

  return {
    pending: pendingQuery.data || [],
    pendingCount: pendingQuery.data?.length || 0,
    isLoading: pendingQuery.isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['website-orders'] }),
  };
}

