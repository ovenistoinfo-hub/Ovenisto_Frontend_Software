import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ShoppingBag, Loader2, Check, Clock, Phone, MapPin } from 'lucide-react';
import { statusTone } from '@/lib/statusTone';
import { useWebsiteOrders } from '@/hooks/useWebsiteOrders';
import { orderService, type OrderRecord } from '@/services/order.service';
import { useData } from '@/contexts/DataContext';
import { toast } from 'sonner';
import { isAwaitingAcceptance } from '@/lib/orderAcceptance';

export function WebsiteOrdersInbox({ compact = false }: { compact?: boolean }) {
  const { pending, today, isLoading, refresh } = useWebsiteOrders();
  const { settings } = useData();

  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OrderRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [collectingId, setCollectingId] = useState<string | null>(null);

  const handleAccept = async (order: OrderRecord) => {
    try {
      setAcceptingId(order.id);
      await orderService.acceptOrder(order.id);
      toast.success('Order accepted');
      refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to accept order');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      setRejecting(true);
      await orderService.rejectOrder(rejectTarget.id, rejectReason.trim());
      toast.success('Order declined');
      setRejectTarget(null);
      setRejectReason('');
      refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to decline order');
    } finally {
      setRejecting(false);
    }
  };

  const handleCollect = async (order: OrderRecord, method: string) => {
    if (!method) return;
    try {
      setCollectingId(order.id);
      await orderService.updateOrder(order.id, { paymentMethod: method });
      toast.success('Payment collected');
      refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to collect payment');
    } finally {
      setCollectingId(null);
    }
  };

  // Sort pending oldest first
  const sortedPending = [...pending].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  // Sort today newest first
  // Everything else from today means we exclude what is in pending
  const sortedToday = [...today]
    .filter(o => !isAwaitingAcceptance(o))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const renderCard = (o: OrderRecord, isNew: boolean) => {
    const tone = statusTone(o.status);
    const mins = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
    const cur = settings?.currency ?? 'Rs.';
    const methods = settings?.paymentMethods?.length ? settings.paymentMethods : ['Cash'];

    return (
      <Card key={o.id} className="overflow-hidden rounded-2xl shadow-sm border-border/60 bg-card flex flex-col">
        <div className="bg-muted/30 p-3 px-4 flex items-center justify-between border-b border-border/40">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight">#{o.orderNumber}</span>
              <Badge variant="secondary" className="text-[10px] font-semibold tracking-wider uppercase h-5 px-1.5">
                {o.type}
              </Badge>
            </div>
            <div className="flex items-center text-xs text-muted-foreground gap-1.5">
              <Clock className="h-3 w-3" />
              {mins}m ago
            </div>
          </div>
          <Badge className={`rounded-md shadow-sm border ${tone.badge}`}>
            {tone.label}
          </Badge>
        </div>
        
        <div className="p-4 flex-1 flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-1.5">
            <div className="font-semibold flex items-center justify-between">
              <span>{o.customerName || 'Guest'}</span>
              {!isNew && o.status !== 'cancelled' && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                  {o.paymentMethod !== 'Pending' ? `Paid · ${o.paymentMethod}` : "Unpaid"}
                </span>
              )}
            </div>
            {!isNew && o.acceptedByName && (
              <span className="text-[10px] text-muted-foreground leading-none -mt-0.5 mb-1 block">
                Accepted by {o.acceptedByName}
              </span>
            )}
            {o.phone && (
              <a href={`tel:${o.phone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline w-fit">
                <Phone className="h-3 w-3" /> {o.phone}
              </a>
            )}
            {o.type === 'Delivery' && o.deliveryAddress && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground mt-0.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="line-clamp-2 leading-relaxed">{o.deliveryAddress}</span>
              </div>
            )}
          </div>

          <div className="bg-muted/20 rounded-xl p-3 border border-border/40 space-y-2">
            {o.items.map((it, i) => (
              <div key={i} className="flex justify-between items-start gap-2 text-xs">
                <div className="flex gap-1.5">
                  <span className="font-bold min-w-[1.25rem]">{it.qty}x</span>
                  <div className="flex flex-col">
                    <span className="font-medium leading-relaxed">{it.name}</span>
                    {it.modifiers?.map((m: any, idx: number) => {
                      const mName = typeof m === 'string' ? m : m?.name;
                      return mName ? (
                        <span key={idx} className="text-muted-foreground leading-tight">+ {mName}</span>
                      ) : null;
                    })}
                    {it.notes && <span className="text-muted-foreground italic leading-tight">Note: {it.notes}</span>}
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-border/50 flex flex-col gap-1 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{cur} {o.subtotal?.toLocaleString()}</span>
              </div>
              {o.discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount {o.appliedDealName ? `(${o.appliedDealName})` : ''}</span>
                  <span>-{cur} {o.discount.toLocaleString()}</span>
                </div>
              )}
              {o.tax > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>{cur} {o.tax.toLocaleString()}</span>
                </div>
              )}
              {o.deliveryFee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Fee</span>
                  <span>{cur} {o.deliveryFee.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-1">
                <span>Total</span>
                <span>{cur} {o.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {isNew && (
          <div className="p-3 bg-muted/20 border-t border-border/40 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 text-xs rounded-xl h-10 font-semibold"
              disabled={acceptingId === o.id}
              onClick={() => { setRejectTarget(o); setRejectReason(''); }}
            >
              Decline
            </Button>
            <Button
              size="sm"
              className="flex-1 gradient-primary text-primary-foreground text-xs font-bold rounded-xl h-10 shadow-md shadow-primary/20 hover:opacity-95"
              disabled={acceptingId === o.id}
              onClick={() => handleAccept(o)}
            >
              {acceptingId === o.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <><Check className="h-3.5 w-3.5 mr-1" /> Accept Order</>
              )}
            </Button>
          </div>
        )}

        {!isNew && o.type === 'Take Away' && o.paymentMethod === 'Pending' && o.status !== 'cancelled' && (
          <div className="p-3 bg-muted/20 border-t border-border/40 flex flex-wrap gap-2">
            {methods.map(method => (
              <Button
                key={method}
                size="sm"
                variant="outline"
                className="flex-1 text-xs rounded-xl h-9 min-w-[80px]"
                disabled={collectingId === o.id}
                onClick={() => handleCollect(o, method)}
              >
                {collectingId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : method}
              </Button>
            ))}
          </div>
        )}
      </Card>
    );
  };

  if (isLoading && !sortedPending.length && !sortedToday.length) {
    return <div className="p-8 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className={compact ? "space-y-6" : "space-y-8 max-w-5xl mx-auto"}>
      <section className="space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          New Orders
          {sortedPending.length > 0 && <Badge variant="secondary" className="rounded-full">{sortedPending.length}</Badge>}
        </h3>
        {sortedPending.length === 0 ? (
          <div className="border border-dashed border-border/60 rounded-2xl p-8 flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
            <ShoppingBag className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm font-medium">No new orders</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedPending.map(o => renderCard(o, true))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-bold text-lg text-muted-foreground">Today's Orders</h3>
        {sortedToday.length === 0 ? (
          <div className="border border-dashed border-border/60 rounded-2xl p-8 flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
            <p className="text-sm">No accepted orders today</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-80 hover:opacity-100 transition-opacity">
            {sortedToday.map(o => renderCard(o, false))}
          </div>
        )}
      </section>

      <Dialog open={rejectTarget !== null} onOpenChange={(open) => { if (!open && !rejecting) setRejectTarget(null); }}>
        <DialogContent className="w-[90vw] max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Decline order?</DialogTitle>
            <DialogDescription>The guest will be told their order was declined. A reason is optional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="decline-reason" className="text-xs font-semibold">Reason for declining (optional)</Label>
            <Textarea
              id="decline-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Item unavailable"
              rows={3}
              maxLength={300}
              className="rounded-xl text-sm resize-none"
              disabled={rejecting}
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={rejecting} className="rounded-xl flex-1 h-10">Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting} className="rounded-xl flex-1 h-10 font-bold">
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
