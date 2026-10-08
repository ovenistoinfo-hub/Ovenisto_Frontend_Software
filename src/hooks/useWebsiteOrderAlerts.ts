import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getSocket } from '@/lib/socket';
import { playAlertBeep } from '@/lib/alertBeep';

export function useWebsiteOrderAlerts() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !hasPermission('website-orders')) return;

    const socket = getSocket();
    if (!socket) return;

    const handler = (payload: any) => {
      if (
        payload?.orderSource === 'website' &&
        payload?.outletId === user.outletId
      ) {
        const type = payload.type || 'Delivery/Pickup';
        const num = payload.orderNumber || '???';
        toast('New website order #' + num + ' (' + type + ')', {
          duration: 10000,
          action: {
            label: 'View',
            onClick: () => navigate('/website-orders')
          }
        });
        playAlertBeep();
      }
    };

    socket.on('order:created', handler);
    return () => {
      socket.off('order:created', handler);
    };
  }, [user, hasPermission, navigate]);
}
