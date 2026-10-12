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

/**
 * Waiter Panel: a table whose booking took an advance. The advance lowers the bill, and it has to sit
 * on one order (`updateOrder({ reservationId })`) so Cash Hub credits the waiter only with the rest —
 * the advance is on whoever took it. That's the last order big enough to hold it (else the largest).
 * When an order already carries an advance (a converted booking), nothing moves. `dues` = what each
 * order still needs from the table's payment.
 */
export function planTableAdvance(
  orders: { total: number; advancePayment?: number | null }[],
  reservationAdvance: number
): { targetIndex: number | null; dues: number[] } {
  const totals = orders.map((o) => roundedPart(o.total));
  if (orders.some((o) => Number(o.advancePayment || 0) > 0)) {
    return { targetIndex: null, dues: orders.map((o, i) => Math.max(0, totals[i] - roundedPart(Number(o.advancePayment || 0)))) };
  }
  const advance = roundedPart(reservationAdvance);
  if (advance === 0 || orders.length === 0) return { targetIndex: null, dues: totals };

  let targetIndex = -1;
  for (let i = totals.length - 1; i >= 0; i--) {
    if (totals[i] >= advance) { targetIndex = i; break; }
  }
  if (targetIndex === -1) {
    targetIndex = totals.reduce((best, t, i) => (t > totals[best] ? i : best), 0);
  }
  const dues = [...totals];
  dues[targetIndex] = Math.max(0, totals[targetIndex] - advance);
  return { targetIndex, dues };
}

/**
 * Does this order still owe money? Nothing recorded (empty / Pending / Unpaid), or only an advance
 * recorded ("Advance (X): Rs.A") with the rest still due. An order that carries an advance and was then
 * paid ("Cash", or "Advance (…), Net (…)") is settled.
 */
export function hasOutstandingBalance(o: { paymentMethod?: string | null; total: number; advancePayment?: number | null }): boolean {
  const pm = (o.paymentMethod ?? "").trim().toLowerCase();
  if (pm === "" || pm === "pending" || pm === "unpaid") return true;
  const advance = Number(o.advancePayment || 0);
  const advanceOnly = /^advance\s*\(/.test(pm) && !/net\s*\(|cod balance\s*\(/.test(pm);
  return advance > 0 && Number(o.total || 0) - advance > 0.01 && advanceOnly;
}

/** The "Net (method): Rs.X" parts of an advance string — what was paid after the advance (mirrors the backend). */
export function parseNetParts(pm: string | null | undefined): PaymentSplit[] {
  const parts: PaymentSplit[] = [];
  const re = /Net\s*\(([^)]+)\)\s*:\s*(?:Rs\.?|PKR)?\s*([\d,]+(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pm ?? "")) !== null) {
    const amount = parseFloat(m[2].replace(/,/g, ""));
    if (amount > 0) parts.push({ method: m[1].trim(), amount });
  }
  return parts;
}

/** The method an advance was paid in ("Advance (JazzCash): Rs.507" → "JazzCash"); else the string itself. */
export function advanceMethodOf(pm: string): string {
  const m = pm.match(/Advance\s*\(([^):,]+)/i);
  return m ? m[1].trim() : pm;
}
