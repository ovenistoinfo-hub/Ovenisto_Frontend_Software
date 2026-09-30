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

  const todayQuery = useQuery({
    queryKey: ['website-orders', 'today'],
    queryFn: async () => {
      const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
      const todayPkt = pkt.toISOString().slice(0, 10);
      const res = await orderService.getOrders({ orderSource: 'website', from: todayPkt, to: todayPkt, limit: 100 });
      return res.data || [];
    },
    enabled,
  });

  return {
    pending: pendingQuery.data || [],
    today: todayQuery.data || [],
    pendingCount: pendingQuery.data?.length || 0,
    isLoading: pendingQuery.isLoading || todayQuery.isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['website-orders'] }),
  };
}

