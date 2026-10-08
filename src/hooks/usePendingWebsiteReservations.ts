import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { reservationService } from '@/services/reservation.service';

/**
 * Website bookings still waiting for staff to accept or decline, for every date. The Reservations
 * page opens on "Today", so a request for a later day was easy to miss; this backs the sidebar
 * badge. `WebsiteReservationsWatcher` keeps it fresh (socket + slow poll).
 */
export function usePendingWebsiteReservations() {
  const { isAuthenticated, hasPermission } = useAuth();
  const enabled = !!isAuthenticated && hasPermission('customers');

  const query = useQuery({
    queryKey: ['website-reservations', 'pending'],
    queryFn: async () => {
      const rows = await reservationService.getAll({ status: 'pending' });
      return rows.filter((r) => r.source === 'website');
    },
    enabled,
  });

  return {
    pending: query.data ?? [],
    pendingCount: query.data?.length ?? 0,
  };
}
