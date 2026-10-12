import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Globe, Loader2, Check, Clock, Phone, MapPin, Navigation, ArrowUpRight, LocateFixed, ShoppingBag, Truck, Gift, X, Inbox, CreditCard, RotateCcw } from 'lucide-react';
import { orderMapsUrl, hasLivePoint } from '@/lib/maps';
import { cn } from '@/lib/utils';
import { useWebsiteOrders } from '@/hooks/useWebsiteOrders';
import { orderService, type OrderRecord, type OrderItemRecord } from '@/services/order.service';
import { paymentService, type RefundDue } from '@/services/payment.service';
import { isPaidOnline, REFUND_REASON_LABEL } from '@/lib/onlinePayment';
import { useData } from '@/contexts/DataContext';
import { toast } from 'sonner';

/** A guest who has waited this long for an answer is shown in red. */
const LATE_AFTER_MIN = 15;

/** 12 → "12m", 95 → "1h 35m", 1500 → "1d 1h". */
const formatWait = (mins: number) =>
  mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;

/** Consecutive lines of one deal redemption become one group; a plain line is a group of its own. */
function groupLines(items: OrderItemRecord[]): { dealName: string | null; lines: OrderItemRecord[] }[] {
  const groups: { key: string | null; dealName: string | null; lines: OrderItemRecord[] }[] = [];
  for (const it of items) {
    const key = it.dealLineId ?? null;
    const last = groups[groups.length - 1];
    if (key && last?.key === key) last.lines.push(it);
    else groups.push({ key, dealName: key ? it.dealName ?? null : null, lines: [it] });
  }
  return groups;
}

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/**
 * Website orders waiting for staff approval, shown inside Order Monitor (the only place they are approved).
 * Accepting sends the order to the kitchen and onto the board; payment for a pickup is collected on its board card.
 */
export function WebsiteOrdersInbox({ onClose }: { onClose?: () => void }) {
  const { pending, refundsDue, isLoading, refresh } = useWebsiteOrders();
  const { settings } = useData();
  const cur = settings?.currency ?? 'Rs.';

  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<OrderRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [refundTarget, setRefundTarget] = useState<RefundDue | null>(null);
  const [refundRef, setRefundRef] = useState('');
  const [refunding, setRefunding] = useState(false);

  const handleMarkRefunded = async () => {
    if (!refundTarget) return;
    try {
      setRefunding(true);
      await paymentService.markRefunded(refundTarget.paymentId, refundRef.trim() || undefined);
      toast.success(`Refund recorded for #${refundTarget.orderNumber}`);
      setRefundTarget(null);
      refresh();
    } catch (err: unknown) {
      toast.error(errorText(err, 'Failed to record the refund'));
    } finally {
      setRefunding(false);
    }
  };

  const handleAccept = async (order: OrderRecord) => {
    try {
      setAcceptingId(order.id);
      await orderService.acceptOrder(order.id);
      toast.success(`Order #${order.orderNumber} accepted`);
      refresh();
    } catch (err: unknown) {
      toast.error(errorText(err, 'Failed to accept order'));
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
    } catch (err: unknown) {
      toast.error(errorText(err, 'Failed to decline order'));
    } finally {
      setRejecting(false);
    }
  };

  // Oldest first: the guest who has waited longest is answered first.
  const orders = [...pending].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const renderCard = (o: OrderRecord) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000));
    const late = mins >= LATE_AFTER_MIN;
    const isDelivery = o.type === 'Delivery';
    const TypeIcon = isDelivery ? Truck : ShoppingBag;
    const name = o.customerName || 'Guest';
    const point = { lat: o.deliveryLat, lng: o.deliveryLng };
    const mapsUrl = isDelivery ? orderMapsUrl({ ...point, address: o.deliveryAddress }) : null;
    const busy = acceptingId === o.id;

    return (
      <article key={o.id} className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-xs">
        {/* Number, channel, how long the guest has waited, and the amount. */}
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-black tracking-tight text-foreground">#{o.orderNumber}</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground">
                <TypeIcon className="h-3 w-3 text-primary" /> {isDelivery ? 'Delivery' : 'Pickup'}
              </span>
              {isPaidOnline(o) && (
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <CreditCard className="h-3 w-3" /> Paid online
                </span>
              )}
            </div>
            <p className={cn('mt-1 flex items-center gap-1 text-xs font-semibold', late ? 'text-destructive' : 'text-muted-foreground')}>
              <Clock className="h-3 w-3" /> Waiting {formatWait(mins)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</span>
            <span className="font-mono text-lg font-black leading-tight text-primary">{cur} {o.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Who ordered, and where it goes. */}
        <div className="mx-4 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black uppercase text-primary">
              {name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              {o.phone && (
                <a href={`tel:${o.phone}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Phone className="h-3 w-3" /> {o.phone}
                </a>
              )}
            </div>
          </div>
          {isDelivery && o.deliveryAddress && (
            <p className="mt-2 flex items-start gap-1.5 border-t border-border/40 pt-2 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="line-clamp-2 leading-relaxed">{o.deliveryAddress}</span>
            </p>
          )}
          {mapsUrl && (
            <div className="mt-1.5 flex items-center gap-2 pl-5">
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                <Navigation className="h-3 w-3" /> Open in Maps <ArrowUpRight className="h-3 w-3" />
              </a>
              {hasLivePoint(point) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  <LocateFixed className="h-3 w-3" /> Live
                </span>
              )}
            </div>
          )}
        </div>

        {/* What they ordered: a deal's dishes sit together under its name. */}
        <ul className="flex-1 space-y-2.5 px-4 py-3 text-xs">
          {groupLines(o.items).map((g, gi) => (
            <li key={gi}>
              {g.dealName && (
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                  <Gift className="h-3 w-3" /> {g.dealName}
                </p>
              )}
              <ul className={cn('space-y-1.5', g.dealName && 'border-l-2 border-primary/25 pl-2.5')}>
                {g.lines.map((it) => {
                  // The stored name of a deal dish repeats the deal ("Duo Offer: Chicken Tikka Pizza").
                  const prefix = g.dealName ? `${g.dealName}: ` : '';
                  const label = prefix && it.name.startsWith(prefix) ? it.name.slice(prefix.length) : it.name;
                  return (
                    <li key={it.id} className="flex items-start gap-2">
                      <span className="mt-px inline-flex h-5 min-w-[1.5rem] shrink-0 items-center justify-center rounded-md bg-muted px-1 font-mono text-[11px] font-black text-foreground">
                        {it.qty}×
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug text-foreground">{label}</span>
                        {it.modifiers?.map((m) => <span key={m} className="block leading-tight text-muted-foreground">+ {m}</span>)}
                        {it.notes && <span className="block italic leading-tight text-muted-foreground">Note: {it.notes}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>

        {/* The stored money lines (never re-derived here). */}
        <dl className="mx-4 mb-3 space-y-0.5 border-t border-dashed border-border/60 pt-2 text-[11px] text-muted-foreground">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-mono">{cur} {o.subtotal?.toLocaleString()}</dd></div>
          {o.discount > 0 && (
            <div className="flex justify-between">
              <dt>Discount{o.appliedDealName ? ` (${o.appliedDealName})` : ''}</dt>
              <dd className="font-mono">-{cur} {o.discount.toLocaleString()}</dd>
            </div>
          )}
          {o.tax > 0 && <div className="flex justify-between"><dt>Tax</dt><dd className="font-mono">{cur} {o.tax.toLocaleString()}</dd></div>}
          {o.deliveryFee > 0 && <div className="flex justify-between"><dt>Delivery fee</dt><dd className="font-mono">{cur} {o.deliveryFee.toLocaleString()}</dd></div>}
        </dl>

        <div className="grid grid-cols-[auto_1fr] gap-2 border-t border-border/50 bg-muted/20 p-3">
          <Button
            variant="outline"
            className="h-10 rounded-lg border-destructive/30 px-4 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() => { setRejectTarget(o); setRejectReason(''); }}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Decline
          </Button>
          <Button
            className="gradient-primary h-10 rounded-lg text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 hover:opacity-95"
            disabled={busy}
            onClick={() => handleAccept(o)}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" /> Accept order</>}
          </Button>
        </div>
      </article>
    );
  };

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
      {/* Same header strip as the board's type columns. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-muted/30 p-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Globe className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold tracking-tight text-foreground">Website Orders</h2>
            <p className="truncate text-[11px] text-muted-foreground">Accept an order to send it to the kitchen. It then joins the board.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={cn('h-7 rounded-md px-2.5 font-mono text-[11px] font-bold', orders.length > 0 ? 'border-primary/30 bg-primary/10 text-primary' : 'text-muted-foreground')}>
            {orders.length} waiting
          </Badge>
          {onClose && (
            <Button variant="outline" size="sm" className="h-7 rounded-md px-2.5 text-[11px] font-semibold" onClick={onClose}>
              Back to board
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {refundsDue.length > 0 && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-center gap-2 text-sm font-extrabold text-foreground">
              <RotateCcw className="h-4 w-4 text-destructive" /> Refunds due ({refundsDue.length})
            </p>
            <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Refund each one from the Safepay dashboard, then mark it here.</p>
            <ul className="space-y-2">
              {refundsDue.map((r) => (
                <li key={r.paymentId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      #{r.orderNumber} · {r.customerName || 'Guest'}{r.phone ? ` · ${r.phone}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {REFUND_REASON_LABEL[r.reason]} · paid {cur} {r.paid.toLocaleString()} · Safepay {r.tracker}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-destructive">{cur} {r.due.toLocaleString()}</span>
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-semibold" onClick={() => { setRefundTarget(r); setRefundRef(''); }}>
                      Mark refunded
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isLoading && orders.length === 0 ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : orders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-muted/40">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="mb-1 text-base font-extrabold text-foreground">No website orders waiting</h3>
            <p className="max-w-sm text-xs text-muted-foreground">A new order shows up here with an alert. Accepted orders are on the board.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {orders.map(renderCard)}
          </div>
        )}
      </div>

      <Dialog open={rejectTarget !== null} onOpenChange={(open) => { if (!open && !rejecting) setRejectTarget(null); }}>
        <DialogContent className="w-[90vw] max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Decline order{rejectTarget ? ` #${rejectTarget.orderNumber}` : ''}?</DialogTitle>
            <DialogDescription>The guest will be told their order was declined. A reason is optional.</DialogDescription>
            {rejectTarget && isPaidOnline(rejectTarget) && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-foreground">
                Paid online ({cur} {rejectTarget.total.toLocaleString()}). After declining, refund it from the Safepay dashboard, then mark it under Refunds due.
              </p>
            )}
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
              className="resize-none rounded-xl text-sm"
              disabled={rejecting}
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={rejecting} className="h-10 flex-1 rounded-xl">Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting} className="h-10 flex-1 rounded-xl font-bold">
              {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundTarget !== null} onOpenChange={(open) => { if (!open && !refunding) setRefundTarget(null); }}>
        <DialogContent className="w-[90vw] max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Mark refunded{refundTarget ? ` · #${refundTarget.orderNumber}` : ''}</DialogTitle>
            <DialogDescription>
              Confirm you refunded {cur} {refundTarget?.due.toLocaleString()} from the Safepay dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="refund-ref" className="text-xs font-semibold">Safepay refund reference (optional)</Label>
            <Input id="refund-ref" value={refundRef} onChange={(e) => setRefundRef(e.target.value)} maxLength={100} disabled={refunding} className="rounded-xl" />
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={refunding} className="h-10 flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleMarkRefunded} disabled={refunding} className="h-10 flex-1 rounded-xl font-bold">
              {refunding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark refunded'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
