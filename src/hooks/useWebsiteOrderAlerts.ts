import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getSocket } from '@/lib/socket';

let audioCtx: AudioContext | null = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioCtxConstructor = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxConstructor) audioCtx = new AudioCtxConstructor();
  }
  return audioCtx;
}

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

        try {
          const ctx = getAudioContext();
          if (ctx) {
            if (ctx.state === 'suspended') {
              ctx.resume().catch(() => {});
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(1, ctx.currentTime + 0.15);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.2);
          }
        } catch (err) {
          // Ignore audio errors
        }
      }
    };

    socket.on('order:created', handler);
    return () => {
      socket.off('order:created', handler);
    };
  }, [user, hasPermission, navigate]);
}

