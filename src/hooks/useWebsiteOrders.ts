import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orderService } from '@/services/order.service';
import { paymentService } from '@/services/payment.service';
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

  // Paid online but owed back (declined, cancelled, reduced, or paid twice). Same key prefix, so the
  // watcher's ['website-orders'] invalidation refreshes it too.
  const refundsQuery = useQuery({
    queryKey: ['website-orders', 'refunds-due'],
    queryFn: () => paymentService.getRefundsDue(),
    enabled,
  });

  return {
    pending: pendingQuery.data || [],
    refundsDue: refundsQuery.data || [],
    refundsError: refundsQuery.isError,
    pendingCount: pendingQuery.data?.length || 0,
    isLoading: pendingQuery.isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['website-orders'] }),
  };
}

