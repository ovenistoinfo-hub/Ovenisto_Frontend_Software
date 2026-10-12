// How a payment taken on a "Payment Checkout" form (POS Finalize Sale, Waiter Panel Pay Bill, the
// website pickup form) is written to `Order.paymentMethod`. The backend's Cash Hub books every
// "Method: Rs.X" part exactly as written (cash-settlement.service.ts parsePaymentMethodAmounts), so
// the parts must add up to what the order actually cost — never to what the customer handed over.

export interface PaymentSplit {
  method: string;
  amount: number;
}

const roundedPart = (amount: number) => Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0));

export function splitTotal(splits: PaymentSplit[]): number {
  return splits.reduce((sum, p) => sum + roundedPart(p.amount), 0);
}

/** "Cash" for one method, "Cash: Rs.900, JazzCash: Rs.779" for a split. Zero parts are dropped. */
export function buildPaymentMethodString(splits: PaymentSplit[]): string {
  const used = splits.map((p) => ({ method: p.method, amount: roundedPart(p.amount) })).filter((p) => p.amount > 0);
  if (used.length === 1) return used[0].method;
  return used.map((p) => `${p.method}: Rs.${p.amount}`).join(", ");
}

export function changeDue(given: number, total: number): number {
  return Math.max(0, Math.round((Number.isFinite(given) ? given : 0) - total));
}

/**
 * The payments added on the form, merged per method (in the order first added), with the change handed
 * back taken off so they add up to `due`: off the cash part first, then off the last non-cash part.
 */
export function settlePaymentEntries(entries: PaymentSplit[], due: number): PaymentSplit[] {
  const merged: PaymentSplit[] = [];
  for (const e of entries) {
    const amount = roundedPart(e.amount);
    if (amount === 0) continue;
    const same = merged.find((m) => m.method === e.method);
    if (same) same.amount += amount;
    else merged.push({ method: e.method, amount });
  }
  let change = splitTotal(merged) - Math.round(due);
  if (change > 0) {
    const isCash = (m: PaymentSplit) => m.method.trim().toLowerCase() === "cash";
    const giveBackFrom = [...merged.filter(isCash), ...merged.filter((m) => !isCash(m)).reverse()];
    for (const m of giveBackFrom) {
      const take = Math.min(m.amount, change);
      m.amount -= take;
      change -= take;
      if (change <= 0) break;
    }
  }
  return merged.filter((m) => m.amount > 0);
}

/** One order's payment string: one method used → just its name ("Cash"); a split → its parts. */
export function settledPaymentMethod(entries: PaymentSplit[], due: number): string {
  return buildPaymentMethodString(settlePaymentEntries(entries, due));
}

/**
 * Waiter Panel settles a whole table at once, but each order stores its own string, so one table
 * payment has to be shared out: every order gets its own due from the settled amounts, in order
 * (the first orders fill from the first method, the next ones carry on from where it ran out), and
 * the last order takes whatever is left. With one method used, every order just gets its name.
 */
export function allocatePaymentToOrders(settled: PaymentSplit[], orderDues: number[]): string[] {
  const pool = settled.map((p) => ({ method: p.method, amount: roundedPart(p.amount) })).filter((p) => p.amount > 0);
  if (pool.length === 0) return orderDues.map(() => "");
  if (new Set(pool.map((p) => p.method)).size === 1) return orderDues.map(() => pool[0].method);

  return orderDues.map((rawDue, idx) => {
    const isLast = idx === orderDues.length - 1;
    let need = roundedPart(rawDue);
    const parts: PaymentSplit[] = [];
    for (const p of pool) {
      if (!isLast && need <= 0) break;
      const take = isLast ? p.amount : Math.min(p.amount, need);
      if (take <= 0) continue;
      parts.push({ method: p.method, amount: take });
      p.amount -= take;
      need -= take;
    }
    // Only when the table's bill and its orders' dues disagree (e.g. a reservation advance): an order
    // left with nothing still needs a method, or it would be saved as unpaid.
    return parts.length > 0 ? buildPaymentMethodString(parts) : pool[0].method;
  });
}
