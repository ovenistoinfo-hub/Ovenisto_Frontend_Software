const usablePhone = (p?: string | null): string => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 7 && !/^(0{11}|1{11}|12345678901)$/.test(d) ? d : "";
};

/**
 * Whether an order belongs to a customer: same id, else same phone. The name only counts when the customer has
 * no usable phone, because two customers can share a name (mirrors the backend's `pickCustomerStat`).
 */
export function orderBelongsToCustomer(
  o: { customerId?: string | null; customerName?: string | null; customer?: string | null; phone?: string | null },
  c: { id: string; name: string; phone?: string | null },
): boolean {
  if (o.customerId) return o.customerId === c.id;
  const cp = usablePhone(c.phone);
  if (cp) return usablePhone(o.phone) === cp;
  const name = (o.customerName ?? o.customer ?? "").toLowerCase().trim();
  return name !== "" && name === c.name.toLowerCase().trim();
}
