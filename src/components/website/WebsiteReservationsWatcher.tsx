import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleEvents } from '@/hooks/use-module-events';
import { useVisiblePolling } from '@/hooks/use-visible-polling';
import { getSocket } from '@/lib/socket';
import { playAlertBeep } from '@/lib/alertBeep';
import type { Reservation } from '@/services/reservation.service';

const RESERVATION_EVENTS = ['reservation:created', 'reservation:updated', 'reservation:deleted'] as const;

function describeBooking(r: Reservation): string {
  const type = r.orderType === 'Take Away' ? 'Pickup' : r.orderType || 'Dine In';
  const day = new Date(`${r.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${type} · ${day} at ${r.time}`;
}

/**
 * App-wide alert for new website bookings, like WebsiteOrdersWatcher for orders: a toast + beep on
 * any screen, and fresh data for the pending-requests badge. Mounted once in App.tsx.
 */
export function WebsiteReservationsWatcher() {
  const { user, isAuthenticated, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const enabled = !!isAuthenticated && hasPermission('customers');

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['website-reservations'] }, { cancelRefetch: false });
  }, [queryClient]);

  useModuleEvents(RESERVATION_EVENTS, () => {
    if (enabled) refresh();
  });
  useVisiblePolling(refresh, 180_000, enabled);

  useEffect(() => {
    if (!enabled || !user?.outletId) return;
    const socket = getSocket();
    const onCreated = (payload: Reservation) => {
      if (payload?.source !== 'website' || payload.outletId !== user.outletId) return;
      toast(`New website booking: ${payload.customerName}`, {
        description: describeBooking(payload),
        duration: 10000,
        action: { label: 'View', onClick: () => navigate('/reservations') },
      });
      playAlertBeep();
    };
    socket.on('reservation:created', onCreated);
    return () => {
      socket.off('reservation:created', onCreated);
    };
  }, [enabled, user?.outletId, navigate]);

  return null;
}
