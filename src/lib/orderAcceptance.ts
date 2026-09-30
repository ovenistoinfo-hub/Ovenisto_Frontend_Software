export function isWebsiteOrder(o: { orderSource?: string | null }): boolean {
  return o.orderSource === 'website';
}

export function isAwaitingAcceptance(o: { type: string; orderSource?: string | null; status: string; acceptedById?: string | null }): boolean {
  return (o.type === 'Self Order' || isWebsiteOrder(o)) && o.status === 'pending' && !o.acceptedById;
}

