// Shared color constants for consistent UI across all pages
// Import these instead of defining colors locally per page

export const ORDER_TYPE_COLORS: Record<string, string> = {
  "Dine In": "bg-primary/10 text-primary border-primary/30",
  "Take Away": "bg-accent/10 text-accent border-accent/30",
  Delivery: "bg-info/10 text-info border-info/30",
  Online: "bg-gold/10 text-gold border-gold/30",
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  preparing: "bg-accent/10 text-accent",
  ready: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
  scheduled: "bg-gold/10 text-gold",
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: "bg-success/10 text-success",
  partial: "bg-warning/10 text-warning",
  unpaid: "bg-destructive/10 text-destructive",
};

export const DEAL_TYPE_LABELS: Record<string, string> = {
  percentage: "% Off",
  combo: "Combo",
  buyXgetY: "Buy X Get Y",
  timeBased: "Time-Based",
  optionCombo: "Option Combo",
};

export const DEAL_TYPE_COLORS: Record<string, string> = {
  percentage: "bg-primary/10 text-primary",
  combo: "bg-info/10 text-info",
  buyXgetY: "bg-success/10 text-success",
  timeBased: "bg-warning/10 text-warning",
  optionCombo: "bg-gold/10 text-gold",
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  dispatched: "bg-info/10 text-info",
  delivered: "bg-success/10 text-success",
  returned: "bg-destructive/10 text-destructive",
};
