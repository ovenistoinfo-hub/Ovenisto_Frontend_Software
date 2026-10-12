import { useState } from "react";
import { Banknote, Check, CheckCircle2, CreditCard, Gift, Loader2, Plus, Receipt, Smartphone, Tag, User, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { orderService } from "@/services/order.service";
import { changeDue, groupPickupLines, settledPaymentMethod, splitTotal, type PickupLine } from "@/lib/websitePickup";

export interface PickupPaymentOrder {
  id: string;
  orderNumber: string;
  status: string;
  customer?: string | null;
  phone?: string | null;
  items: PickupLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** The Promo Code / Minimum Spend deal the website applied, if any (part of `discount`). */
  appliedDealName?: string | null;
}

export interface WebsitePickupPaymentDialogProps {
  /** The pickup being paid; null keeps the dialog closed. */
  order: PickupPaymentOrder | null;
  paymentMethods: string[];
  /** The branch's tax rate in percent (e.g. 16), only for the "Tax (16%)" label. */
  taxPercent?: number;
  onOpenChange: (open: boolean) => void;
  /** Runs right before the first write, so the page can ignore its own socket echo. */
  onBeforeWrite?: () => void;
  /** The payment is recorded (and the order completed, when it was Ready). */
  onDone: (order: PickupPaymentOrder, paymentMethod: string) => void;
}

// Same icons as POS's Finalize Sale.
const getPaymentIcon = (methodName: string) => {
  const name = methodName.toLowerCase();
  if (name.includes("cash")) return Banknote;
  if (name.includes("card") || name.includes("bank") || name.includes("hbl") || name.includes("visa") || name.includes("master")) return CreditCard;
  if (name.includes("phone") || name.includes("mobile") || name.includes("jazz") || name.includes("paisa") || name.includes("easypaisa")) return Smartphone;
  return CreditCard;
};

const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

interface Entry {
  id: string;
  method: string;
  amount: number;
}

/**
 * Takes a website pickup's payment at the POS counter, on the same "Payment Checkout" form as POS's
 * Finalize Sale and Waiter Panel's Pay Bill. The bill shows the order's STORED
 * subtotal/discount/tax/total: the website priced it server-side (deals, promo, channel price), so
 * nothing is re-derived from the items, and nothing but the payment (and completion) is written.
 */
export function WebsitePickupPaymentDialog({ order, paymentMethods, taxPercent, onOpenChange, onBeforeWrite, onDone }: WebsitePickupPaymentDialogProps) {
  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-4xl lg:max-w-5xl p-4 sm:p-6 gap-0 overflow-hidden">
        {/* Keyed by order, so every pickup opens with a fresh form. */}
        {order && (
          <PickupPaymentForm
            key={order.id}
            order={order}
            methods={paymentMethods.length > 0 ? paymentMethods : ["Cash"]}
            taxPercent={taxPercent}
            onBeforeWrite={onBeforeWrite}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  order: PickupPaymentOrder;
  methods: string[];
  taxPercent?: number;
  onBeforeWrite?: () => void;
  onDone: (order: PickupPaymentOrder, paymentMethod: string) => void;
}

function PickupPaymentForm({ order, methods, taxPercent, onBeforeWrite, onDone }: FormProps) {
  const due = Math.round(order.total);
  const isReady = order.status === "ready";
  const rows = groupPickupLines(order.items);
  const itemCount = order.items.filter((i) => (i.status ?? "active") === "active").reduce((s, i) => s + i.qty, 0);

  // Same starting state as POS's Finalize Sale: Cash selected, the exact amount pre-filled, nothing added yet.
  const [method, setMethod] = useState(methods.includes("Cash") ? "Cash" : methods[0]);
  const [givenAmount, setGivenAmount] = useState(due);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const totalPaid = splitTotal(entries);
  const totalDue = Math.max(0, due - totalPaid);
  const canConfirm = !submitting && entries.length > 0 && totalPaid >= due;

  const addEntry = () => {
    const amt = Math.round(givenAmount > 0 ? givenAmount : totalDue);
    if (amt <= 0) { toast.error("Enter a valid payment amount"); return; }
    setEntries((prev) => [...prev, { id: `pay-${Date.now()}-${prev.length}`, method, amount: amt }]);
    setGivenAmount(Math.max(0, due - (totalPaid + amt)));
  };

  const removeEntry = (id: string) => {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    setGivenAmount(Math.max(0, due - splitTotal(updated)));
  };

  const confirm = async () => {
    if (!canConfirm) return;
    const paymentMethod = settledPaymentMethod(entries, due);
    setSubmitting(true);
    onBeforeWrite?.();
    try {
      await orderService.updateOrder(order.id, { paymentMethod });
    } catch (err: unknown) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to record payment");
      setSubmitting(false);
      return;
    }
    if (isReady) {
      try {
        await orderService.updateOrderStatus(order.id, "completed");
        toast.success(`Order ${order.orderNumber} paid and handed over`);
      } catch {
        toast.error("Payment recorded, but the order could not be completed. Complete it from Order Monitor.");
      }
    } else {
      toast.success(`Payment collected for ${order.orderNumber}. It is still in the kitchen.`);
    }
    onDone(order, paymentMethod);
  };

  return (
    <>
      {/* Modal Header with Icon Badge */}
      <div className="flex items-center justify-between pb-3 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
            <Receipt className="h-4 w-4" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-foreground tracking-tight">Payment Checkout</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">Website pickup #{order.orderNumber}</DialogDescription>
          </div>
        </div>
        {/* Hidden on phones, where it runs into the close button (the receipt card says "Take Away" too). */}
        <Badge variant="outline" className="hidden sm:inline-flex text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 border-primary/40 text-primary bg-primary/10 rounded-full">
          Take Away · Website
        </Badge>
      </div>

      <div className="pt-4 max-h-[82vh] overflow-y-auto pr-0.5 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 items-start">
        {/* LEFT COLUMN: Order Details & Digital Receipt Card */}
        <div className="bg-muted/30 p-3.5 sm:p-4 rounded-2xl border border-border/60 space-y-3 h-full flex flex-col justify-between">
          <div className="space-y-3">
            {/* Header: Customer & Channel */}
            <div className="flex justify-between items-center text-xs pb-2 border-b border-border/50">
              <div className="flex items-center gap-1.5 min-w-0 font-bold text-foreground">
                <User className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="truncate max-w-[200px]">{order.customer || "Walk-in Customer"}</p>
                  {order.phone && <p className="text-[10px] text-muted-foreground font-mono font-normal truncate">{order.phone}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-background border-border/70">
                  Take Away
                </Badge>
                <span className="text-[11px] text-muted-foreground font-mono font-medium">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              </div>
            </div>

            {/* Items List - Grouped with Deals & Combos support */}
            <div className="bg-background/80 dark:bg-background/50 rounded-xl p-3 border border-border/50 space-y-2.5 max-h-56 md:max-h-[300px] overflow-y-auto scrollbar-thin">
              {rows.map((row, idx) => {
                if (row.kind === "deal") {
                  return (
                    <div key={row.dealLineId} className="space-y-1 pb-2 border-b border-border/30 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <Badge variant="outline" className="text-[9px] font-extrabold text-primary border-primary/30 bg-primary/10 px-1.5 py-0 h-4 uppercase tracking-wider shrink-0 gap-0.5">
                            <Gift className="h-2.5 w-2.5" /> Deal
                          </Badge>
                          <span className="font-bold text-foreground truncate">{row.dealName}</span>
                        </div>
                        <span className="font-mono font-bold text-foreground shrink-0 tabular-nums text-xs">
                          {rs(row.net)}
                        </span>
                      </div>
                      <ul className="space-y-0.5 pl-3 border-l-2 border-primary/20 text-[10px] text-muted-foreground font-medium">
                        {row.items.map((i, itemIdx) => (
                          <li key={i.id ?? itemIdx} className="flex items-center justify-between">
                            <span className="truncate pr-1">• {i.qty}x {i.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }

                const item = row.item;
                return (
                  <div key={item.id ?? idx} className="space-y-0.5 pb-1.5 border-b border-border/30 last:border-0 last:pb-0">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 pr-2">
                        <span className="inline-flex items-center justify-center h-4 px-1 rounded bg-muted text-foreground font-mono font-bold text-[10px]">
                          {item.qty}x
                        </span>
                        <span className="font-semibold text-foreground truncate">{item.name}</span>
                      </div>
                      <span className="font-mono font-bold text-foreground shrink-0 tabular-nums text-xs">
                        {rs(item.price * item.qty - (item.discount ?? 0))}
                      </span>
                    </div>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-[10px] text-muted-foreground/80 pl-6 truncate">
                        {item.modifiers.join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financial Calculation Breakdown — the order's stored figures */}
          <div className="space-y-1.5 pt-2 text-xs border-t border-border/50">
            <div className="flex justify-between text-muted-foreground text-[11px]">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{rs(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-success font-medium text-[11px]">
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {order.appliedDealName || "Discount"}
                </span>
                <span className="font-mono tabular-nums">-{rs(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground text-[11px]">
              <span>{taxPercent !== undefined ? `Tax (${taxPercent}%)` : "Tax"}</span>
              <span className="font-mono tabular-nums">{rs(order.tax)}</span>
            </div>
            <div className="flex justify-between items-center pt-2.5 border-t border-border/60">
              <span className="uppercase tracking-wider text-xs font-bold text-muted-foreground">Order Total</span>
              <span className="text-2xl lg:text-3xl font-black text-primary font-mono tracking-tight tabular-nums">
                {rs(due)}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Payment Methods, Settlement & Action Button */}
        <div className="space-y-3">
          {/* Unified Settlement Card */}
          <div className="bg-muted/20 p-3.5 rounded-2xl border border-border/50 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">Payment Method &amp; Amount</span>
              <span className="font-mono text-muted-foreground text-[11px]">
                {entries.length > 0 ? (
                  totalPaid > due ? (
                    <span className="text-success font-bold">Change: {rs(totalPaid - due)}</span>
                  ) : (
                    <>Remaining: <strong className={cn(totalDue > 0 ? "text-warning font-bold" : "text-success font-bold")}>{rs(totalDue)}</strong></>
                  )
                ) : (
                  <>Due: <strong className="text-foreground font-bold">{rs(due)}</strong></>
                )}
              </span>
            </div>

            {/* Method Chips */}
            <div className="grid grid-cols-2 gap-2">
              {methods.map((pm) => {
                const IconComponent = getPaymentIcon(pm);
                const isSelected = method === pm;
                return (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setMethod(pm)}
                    className={cn(
                      "flex items-center justify-center gap-2 h-10 rounded-xl border text-xs font-semibold transition-all",
                      isSelected
                        ? "border-2 border-primary bg-primary/10 text-primary font-bold shadow-xs"
                        : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <IconComponent className="h-4 w-4 shrink-0" />
                    <span>{pm}</span>
                  </button>
                );
              })}
            </div>

            {/* Amount Input with Add Split Button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted-foreground">Rs.</span>
                <Input
                  type="number"
                  step="1"
                  aria-label="Amount"
                  placeholder={`Amount (Due: ${entries.length > 0 ? totalDue : due})`}
                  value={givenAmount === 0 ? "" : Math.round(givenAmount)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGivenAmount(val === "" ? 0 : Math.round(Number(val)) || 0);
                  }}
                  className="h-10 pl-9 text-sm font-mono font-bold rounded-xl border-border/70 focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="h-10 px-4 shrink-0 gap-1.5 gradient-primary text-primary-foreground font-bold rounded-xl shadow-xs"
                onClick={addEntry}
              >
                <Plus className="h-4 w-4" />Add
              </Button>
            </div>

            {/* Added Payment Entries List */}
            {entries.length > 0 && (
              <div className="space-y-1.5 pt-0.5">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs bg-muted/40 border border-border/40 rounded-xl pl-3 pr-1 py-1">
                    <span className="font-semibold text-foreground">{e.method}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-success tabular-nums">{rs(e.amount)}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeEntry(e.id)} className="h-9 w-9 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors" title="Remove payment entry" aria-label="Remove payment entry">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between items-center pt-2 border-t border-border/40 text-xs">
                  <span className="text-muted-foreground font-medium">Total Settled:</span>
                  <span className={cn("font-mono font-bold tabular-nums", totalPaid >= due ? "text-success" : "text-warning")}>
                    {rs(totalPaid)} / {rs(due)}
                  </span>
                </div>
              </div>
            )}

            {/* Change Return Banner when customer overpays */}
            {totalPaid > due && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-success/10 border border-success/30 text-success text-xs font-bold transition-all animate-in fade-in">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span>Change Return:</span>
                </span>
                <span className="font-mono text-sm tabular-nums">{rs(changeDue(totalPaid, due))}</span>
              </div>
            )}
          </div>

          {!isReady && (
            <p className="text-[11px] text-muted-foreground px-1">
              Still in the kitchen. Once it's ready, complete it from Order Monitor.
            </p>
          )}

          {/* Primary Action Button */}
          <div className="pt-1">
            <Button
              className={cn(
                "w-full h-12 text-sm font-bold rounded-2xl gap-2 transition-all active:scale-[0.99] shadow-md",
                canConfirm
                  ? "gradient-primary text-primary-foreground font-extrabold shadow-primary/20"
                  : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
              )}
              onClick={confirm}
              disabled={!canConfirm}
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" />Processing Payment...</>
                : <><Check className="h-4 w-4" />{isReady ? "Confirm & Hand Over" : "Confirm Payment"}</>}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
