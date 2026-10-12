import { useState } from "react";
import { Banknote, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { orderService } from "@/services/order.service";
import { buildPaymentMethodString, changeDue, splitTotal, type PaymentSplit } from "@/lib/websitePickup";

export interface PickupPaymentOrder {
  id: string;
  orderNumber: string;
  status: string;
  customer?: string | null;
  phone?: string | null;
  items: { id?: string; name: string; qty: number; price: number; discount?: number; dealName?: string | null; status?: string }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface WebsitePickupPaymentDialogProps {
  /** The pickup being paid; null keeps the dialog closed. */
  order: PickupPaymentOrder | null;
  paymentMethods: string[];
  onOpenChange: (open: boolean) => void;
  /** Runs right before the first write, so the page can ignore its own socket echo. */
  onBeforeWrite?: () => void;
  /** The payment is recorded (and the order completed, when it was Ready). */
  onDone: (order: PickupPaymentOrder, paymentMethod: string) => void;
}

const money = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

/**
 * Takes a website pickup's payment at the POS counter. The money shown is the order's STORED
 * subtotal/discount/tax/total — the website priced it server-side (deals, promo, channel price), so
 * nothing here is re-derived from the items, and nothing but the payment (and completion) is written.
 */
export function WebsitePickupPaymentDialog({ order, paymentMethods, onOpenChange, onBeforeWrite, onDone }: WebsitePickupPaymentDialogProps) {
  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
        {/* Keyed by order, so every pickup opens with a fresh form. */}
        {order && (
          <PickupPaymentForm
            key={order.id}
            order={order}
            methods={paymentMethods.length > 0 ? paymentMethods : ["Cash"]}
            onCancel={() => onOpenChange(false)}
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
  onCancel: () => void;
  onBeforeWrite?: () => void;
  onDone: (order: PickupPaymentOrder, paymentMethod: string) => void;
}

function PickupPaymentForm({ order, methods, onCancel, onBeforeWrite, onDone }: FormProps) {
  const due = Math.round(order.total);
  const isReady = order.status === "ready";
  const lines = order.items.filter((i) => (i.status ?? "active") === "active");

  const [method, setMethod] = useState(methods.includes("Cash") ? "Cash" : methods[0]);
  const [cashGiven, setCashGiven] = useState(String(due));
  const [isSplit, setIsSplit] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const splits: PaymentSplit[] = methods.map((m) => ({ method: m, amount: Number(splitAmounts[m] || 0) }));
  const splitPaid = splitTotal(splits);
  const cashGivenNum = Number(cashGiven || 0);
  const isCashSingle = !isSplit && method === "Cash";

  const paymentMethod = isSplit ? buildPaymentMethodString(splits) : method;
  const canSubmit = isSplit
    ? splitPaid === due && paymentMethod !== ""
    : !isCashSingle || cashGivenNum >= due;

  const submit = async () => {
    if (!canSubmit || submitting) return;
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
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" /> Website pickup #{order.orderNumber}
        </DialogTitle>
        <DialogDescription>
          {order.customer || "Walk-in"}{order.phone ? ` · ${order.phone}` : ""}. The price was set when the customer ordered online.
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-lg border border-border/60 divide-y divide-border/40 max-h-48 overflow-y-auto">
        {lines.map((i, idx) => (
          <div key={i.id ?? idx} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="break-words"><span className="font-mono text-muted-foreground">{i.qty}×</span> {i.name}</p>
              {i.dealName && <p className="text-[11px] text-muted-foreground">{i.dealName}</p>}
            </div>
            <span className="font-mono shrink-0">{money(i.price * i.qty - (i.discount ?? 0))}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-mono">{money(order.subtotal)}</span></div>
        {order.discount > 0 && (
          <div className="flex justify-between text-muted-foreground"><span>Discount</span><span className="font-mono">− {money(order.discount)}</span></div>
        )}
        <div className="flex justify-between text-muted-foreground"><span>Tax</span><span className="font-mono">{money(order.tax)}</span></div>
        <div className="flex justify-between text-base font-semibold pt-1"><span>Total</span><span className="font-mono">{money(due)}</span></div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment</Label>
          {methods.length > 1 && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsSplit((s) => !s)}>
              {isSplit ? "Single payment" : "Split payment"}
            </Button>
          )}
        </div>

        {!isSplit ? (
          <div className="flex flex-wrap gap-1.5">
            {methods.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={method === m ? "default" : "outline"}
                className="h-9 flex-1 min-w-[80px] rounded-lg text-xs font-semibold"
                onClick={() => setMethod(m)}
              >
                {m}
              </Button>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {methods.map((m) => (
              <div key={m} className="flex items-center gap-2">
                <Label htmlFor={`split-${m}`} className="w-28 shrink-0 text-sm">{m}</Label>
                <Input
                  id={`split-${m}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="h-9"
                  value={splitAmounts[m] ?? ""}
                  onChange={(e) => setSplitAmounts((prev) => ({ ...prev, [m]: e.target.value }))}
                />
              </div>
            ))}
            <p className={cn("text-xs text-right", splitPaid === due ? "text-muted-foreground" : "text-destructive")}>
              {splitPaid === due ? "Split covers the total" : `Remaining ${money(due - splitPaid)}`}
            </p>
          </div>
        )}

        {isCashSingle && (
          <div className="flex items-center gap-2">
            <Label htmlFor="pickup-cash-given" className="w-28 shrink-0 text-sm">Cash received</Label>
            <Input
              id="pickup-cash-given"
              type="number"
              inputMode="numeric"
              min={0}
              className="h-9"
              value={cashGiven}
              onChange={(e) => setCashGiven(e.target.value)}
            />
            <span className={cn("text-sm font-mono shrink-0", cashGivenNum >= due ? "text-foreground" : "text-destructive")}>
              {cashGivenNum >= due ? `Change ${money(changeDue(cashGivenNum, due))}` : "Short"}
            </span>
          </div>
        )}

        {!isReady && (
          <p className="text-xs text-muted-foreground">
            Still in the kitchen. Once it's ready, complete it from Order Monitor.
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="button" onClick={submit} disabled={!canSubmit || submitting} className="gap-1.5">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
          {isReady ? "Collect & Hand Over" : "Collect Payment"}
        </Button>
      </DialogFooter>
    </>
  );
}
