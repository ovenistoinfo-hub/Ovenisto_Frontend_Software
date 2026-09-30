import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleEvents } from '@/hooks/use-module-events';
import { useVisiblePolling } from '@/hooks/use-visible-polling';
import { useWebsiteOrderAlerts } from '@/hooks/useWebsiteOrderAlerts';

export function WebsiteOrdersWatcher() {
  const { user, isAuthenticated, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !!isAuthenticated && hasPermission('website-orders');

  useWebsiteOrderAlerts();

  useModuleEvents(['order:created', 'order:updated', 'order:deleted'], (payload: any) => {
    if (!enabled) return;

    const shouldInvalidate =
      !payload?.orderSource ||
      (payload.orderSource === 'website' && payload.outletId === user?.outletId);

    if (shouldInvalidate) {
      queryClient.invalidateQueries(
        { queryKey: ['website-orders'] },
        { cancelRefetch: false }
      );
    }
  });

  useVisiblePolling(() => {
    queryClient.invalidateQueries(
      { queryKey: ['website-orders'] },
      { cancelRefetch: false }
    );
  }, 180_000, enabled);

  return null;
}
