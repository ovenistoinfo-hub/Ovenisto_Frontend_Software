export type OrderStatusKey = "pending" | "preparing" | "ready" | "completed" | "cancelled";

export interface StatusTone {
  label: string;
  badge: string;
  text: string;
  dot: string;
  borderL: string;
  tint: string;
  tile: string;
  solid: string;
}

// Single source of truth for order/dish status colors. pending=warning, preparing=info,
// ready/completed=success, cancelled=destructive. Full class strings are literal so Tailwind keeps them.
export const STATUS_TONE: Record<OrderStatusKey, StatusTone> = {
  pending: {
    label: "Pending",
    badge: "bg-warning/15 text-warning border border-warning/30",
    text: "text-warning",
    dot: "bg-warning",
    borderL: "border-l-warning",
    tint: "bg-warning/5",
    tile: "bg-warning/15 text-warning border-warning/40",
    solid: "bg-warning text-warning-foreground hover:bg-warning/90",
  },
  preparing: {
    label: "Preparing",
    badge: "bg-info/15 text-info border border-info/30",
    text: "text-info",
    dot: "bg-info",
    borderL: "border-l-info",
    tint: "bg-info/5",
    tile: "bg-info/15 text-info border-info/40",
    solid: "bg-info text-info-foreground hover:bg-info/90",
  },
  ready: {
    label: "Ready",
    badge: "bg-success/15 text-success border border-success/30",
    text: "text-success",
    dot: "bg-success",
    borderL: "border-l-success",
    tint: "bg-success/5",
    tile: "bg-success/15 text-success border-success/40",
    solid: "bg-success text-success-foreground hover:bg-success/90",
  },
  completed: {
    label: "Completed",
    badge: "bg-success/15 text-success border border-success/30",
    text: "text-success",
    dot: "bg-success",
    borderL: "border-l-success",
    tint: "bg-success/5",
    tile: "bg-success/15 text-success border-success/40",
    solid: "bg-success text-success-foreground hover:bg-success/90",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-destructive/15 text-destructive border border-destructive/30",
    text: "text-destructive",
    dot: "bg-destructive",
    borderL: "border-l-destructive",
    tint: "bg-destructive/5",
    tile: "bg-destructive/15 text-destructive border-destructive/40",
    solid: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
};

const ALIASES: Record<string, OrderStatusKey> = {
  pending: "pending",
  new: "pending",
  preparing: "preparing",
  cooking: "preparing",
  in_progress: "preparing",
  ready: "ready",
  completed: "completed",
  complete: "completed",
  served: "completed",
  delivered: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  rejected: "cancelled",
};

const NEUTRAL: StatusTone = {
  label: "",
  badge: "bg-muted text-muted-foreground border border-border",
  text: "text-muted-foreground",
  dot: "bg-muted-foreground",
  borderL: "border-l-border",
  tint: "bg-muted/30",
  tile: "bg-muted text-muted-foreground border-border",
  solid: "bg-muted text-foreground hover:bg-muted/80",
};

export function statusKey(status: string | null | undefined): OrderStatusKey | null {
  if (!status) return null;
  return ALIASES[status.trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? null;
}

export function statusTone(status: string | null | undefined): StatusTone {
  const key = statusKey(status);
  return key ? STATUS_TONE[key] : NEUTRAL;
}
