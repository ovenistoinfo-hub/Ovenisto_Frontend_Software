import {
  TrendingUp, DollarSign, Wallet, ArrowUpCircle, ArrowDownCircle,
  BarChart3, ShoppingBag, Clock, ChevronRight, ChevronDown, Trophy, Users, ChefHat, LayoutGrid, Ban, Package,
  ClipboardList, ArrowLeftRight, UserCheck, CalendarOff, Bike, CalendarCheck, Coins, Calendar as CalendarIcon,
  UtensilsCrossed, Percent, X, Layers, CreditCard, Banknote, Smartphone, TrendingDown,
  Tag, Info, Building2, Receipt, Trash2, CalendarClock,
} from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { TimePicker, formatTimeLabel } from "@/components/ui/time-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell, LabelList, CartesianGrid, LineChart, Line } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { reportService } from "@/services/report.service";
import { stockService } from "@/services/stock.service";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useOrderEvents } from "@/hooks/use-order-events";
import { useModuleEvents } from "@/hooks/use-module-events";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { DASHBOARD_TILES } from "@/lib/dashboardTiles";

/**
 * Whole-Card tap target, mirroring POS.tsx's menu-card hover/press classes so it feels
 * right on mouse and the POS tablet. `interactive` false renders a plain, static Card —
 * no chevron, no hover lift (a viewer who can't reach the destination just sees the data).
 */
function ClickableCard({ interactive, onClick, className, children }: { interactive: boolean; onClick?: () => void; className?: string; children: ReactNode }) {
  return (
    <Card
      className={cn(
        "shadow-sm relative transition-all duration-200",
        interactive && "cursor-pointer hover:shadow-xl hover:border-primary/40 hover:-translate-y-0.5 active:scale-[0.99]",
        className
      )}
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
    >
      {children}
      {interactive && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 absolute top-2 right-2" />}
    </Card>
  );
}

/**
 * One operational-zone stat card (Phase 4). `visible` is the tile's own permission check —
 * returning null here (rather than the caller skipping the JSX) keeps every zone's tile
 * list declarative and uniform. Icon box always stays neutral (`bg-muted`) — only
 * `valueClassName` may color the number itself, for the handful of tiles that represent an
 * actual problem count (non-zero low stock / pending approvals).
 */
function StatTile({
  visible, interactive, onClick, icon: Icon, title, value, valueClassName, sub,
}: {
  visible: boolean;
  interactive: boolean;
  onClick?: () => void;
  icon: LucideIcon;
  title: string;
  value: ReactNode;
  valueClassName?: string;
  sub?: ReactNode;
}) {
  if (!visible) return null;
  return (
    <ClickableCard interactive={interactive} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className={cn("text-2xl font-bold mt-1", valueClassName)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-muted shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </ClickableCard>
  );
}

/**
 * Themed Recharts tooltip — matches the app's popover surface. Lists every series in the
 * hovered point (`name: value`). Peak Hours / Day-of-Week keep their own bespoke tooltips
 * because they surface a field that isn't a rendered bar; the stacked charts use this.
 */
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground flex items-center gap-1.5">
          {p.color && <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: p.color }} />}
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

const Dashboard = () => {
  const { outletId, setOutletId, outlets, isSuperAdmin } = useOutletFilter();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { data: d, isLoading: loading } = useQuery({
    queryKey: ["dashboard", outletId],
    queryFn: () => reportService.getDashboard({ outletId }),
  });
  const currency = "Rs.";

  // All tiles this viewer can actually reach — filtered once, same idiom AppSidebar.tsx
  // uses for navSections. The always-on cards below (day-wise chart, channel cards,
  // financial overview, Customer Intelligence's charts) aren't tiles; they're gated
  // separately by their own permission check (salesDrillEnabled / customerIntelVisible).
  const visibleTiles = DASHBOARD_TILES.filter((t) => hasPermission(t.module));
  const tileVisible = (id: string) => visibleTiles.some((t) => t.id === id);
  // Today's Operations / Inventory / People / Delivery / Reservations / Cash Hub are 100%
  // tile-driven (unlike Sales & Finance / Customer Intelligence, which mix tiles with
  // always-on charts) — a zone header renders only if at least one of its tiles is visible,
  // the same skip-empty-group idiom AppSidebar.tsx uses for navSections.
  const zoneVisible = (zone: string) => visibleTiles.some((t) => t.zone === zone);
  const goToTile = (id: string) => {
    const tile = visibleTiles.find((t) => t.id === id);
    if (!tile) return;
    if (tile.superAdminRoute && user?.role === "Super Admin") navigate(tile.superAdminRoute.route);
    else navigate(tile.route);
  };
  const salesDrillEnabled = hasPermission("sales");
  const goToSales = () => navigate("/sales");
  // Customer Intelligence is the merged-in Analytics page — keep its pre-merge audience
  // (Analytics was gated on "analytics", held only by Manager + the wildcard roles).
  // "reports" is the natural successor and maps to the exact same set; Floor Manager /
  // Cashier never had the Analytics page, so they don't get this zone.
  const customerIntelVisible = hasPermission("reports");

  const toYmd = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  // Sales By Channel (Date & optional Time filtered, gated on "reports" permission)
  const salesByChannelVisible = hasPermission("reports");
  const [channelSectionCollapsed, setChannelSectionCollapsed] = useState<boolean>(false);
  const [channelPreset, setChannelPreset] = useState<string>("Today");
  const [channelFromStr, setChannelFromStr] = useState<string>(toYmd(new Date()));
  const [channelToStr, setChannelToStr] = useState<string>(toYmd(new Date()));
  const [channelTimeFrom, setChannelTimeFrom] = useState<string>("");
  const [channelTimeTo, setChannelTimeTo] = useState<string>("");

  // Sales by Category — same filter model as Sales By Channel, its own independent state
  // (both sections are separately collapsible; a user may want a different window in each).
  const [catSectionCollapsed, setCatSectionCollapsed] = useState<boolean>(false);
  const [catPreset, setCatPreset] = useState<string>("Today");
  const [catFromStr, setCatFromStr] = useState<string>(toYmd(new Date()));
  const [catToStr, setCatToStr] = useState<string>(toYmd(new Date()));
  const [catTimeFrom, setCatTimeFrom] = useState<string>("");
  const [catTimeTo, setCatTimeTo] = useState<string>("");

  // Sales by Payment Method — same filter model again, its own state.
  const [paySectionCollapsed, setPaySectionCollapsed] = useState<boolean>(false);
  const [payPreset, setPayPreset] = useState<string>("Today");
  const [payFromStr, setPayFromStr] = useState<string>(toYmd(new Date()));
  const [payToStr, setPayToStr] = useState<string>(toYmd(new Date()));
  const [payTimeFrom, setPayTimeFrom] = useState<string>("");
  const [payTimeTo, setPayTimeTo] = useState<string>("");

  // Top & Bottom Items — same filter model, its own state.
  const [itemsSectionCollapsed, setItemsSectionCollapsed] = useState<boolean>(false);
  const [itemsPreset, setItemsPreset] = useState<string>("Today");
  const [itemsFromStr, setItemsFromStr] = useState<string>(toYmd(new Date()));
  const [itemsToStr, setItemsToStr] = useState<string>(toYmd(new Date()));
  const [itemsTimeFrom, setItemsTimeFrom] = useState<string>("");
  const [itemsTimeTo, setItemsTimeTo] = useState<string>("");

  // Net Profit — date range only (no time-of-day; expenses/waste aren't hourly). Defaults to
  // "This Month" since a P&L over a single day is rarely what you want.
  const [npSectionCollapsed, setNpSectionCollapsed] = useState<boolean>(false);
  const [npPreset, setNpPreset] = useState<string>("This Month");
  const [npFromStr, setNpFromStr] = useState<string>(toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [npToStr, setNpToStr] = useState<string>(toYmd(new Date()));

  // Deals Performance — same date-range-only choice as Net Profit (deal usage isn't hourly).
  const [dpSectionCollapsed, setDpSectionCollapsed] = useState<boolean>(false);
  const [dpPreset, setDpPreset] = useState<string>("This Month");
  const [dpFromStr, setDpFromStr] = useState<string>(toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [dpToStr, setDpToStr] = useState<string>(toYmd(new Date()));

  // Sales by Staff — same filter model as Sales By Channel (date + optional time-of-day; shift
  // analysis benefits from it), its own independent state.
  const [staffSectionCollapsed, setStaffSectionCollapsed] = useState<boolean>(false);
  const [staffPreset, setStaffPreset] = useState<string>("Today");
  const [staffFromStr, setStaffFromStr] = useState<string>(toYmd(new Date()));
  const [staffToStr, setStaffToStr] = useState<string>(toYmd(new Date()));
  const [staffTimeFrom, setStaffTimeFrom] = useState<string>("");
  const [staffTimeTo, setStaffTimeTo] = useState<string>("");

  // Sales by Outlet — chain-wide branch comparison, date-range only (same reasoning as Deals
  // Performance/Net Profit). Only meaningful for Super Admin viewing "All Outlets"; gated in JSX.
  const [branchSectionCollapsed, setBranchSectionCollapsed] = useState<boolean>(false);
  const [branchPreset, setBranchPreset] = useState<string>("This Month");
  const [branchFromStr, setBranchFromStr] = useState<string>(toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [branchToStr, setBranchToStr] = useState<string>(toYmd(new Date()));

  // Cancellation Requests — date-range only (a cancellation is a discrete event, not hourly).
  const [crSectionCollapsed, setCrSectionCollapsed] = useState<boolean>(false);
  const [crPreset, setCrPreset] = useState<string>("This Month");
  const [crFromStr, setCrFromStr] = useState<string>(toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [crToStr, setCrToStr] = useState<string>(toYmd(new Date()));

  // Purchases & Supplier Spend — date-range only (a purchase isn't hourly).
  const [pSectionCollapsed, setPSectionCollapsed] = useState<boolean>(false);
  const [pPreset, setPPreset] = useState<string>("This Month");
  const [pFromStr, setPFromStr] = useState<string>(toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [pToStr, setPToStr] = useState<string>(toYmd(new Date()));

  // Expenses Breakdown & Trends — date-range only, same reasoning as Net Profit/Purchases
  // (an expense is a discrete daily record, not hourly).
  const [expSectionCollapsed, setExpSectionCollapsed] = useState<boolean>(false);
  const [expPreset, setExpPreset] = useState<string>("This Month");
  const [expFromStr, setExpFromStr] = useState<string>(toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [expToStr, setExpToStr] = useState<string>(toYmd(new Date()));

  // Waste / Food Loss Trends — same date-range-only shape as Expenses Breakdown.
  const [wasteSectionCollapsed, setWasteSectionCollapsed] = useState<boolean>(false);
  const [wastePreset, setWastePreset] = useState<string>("This Month");
  const [wasteFromStr, setWasteFromStr] = useState<string>(toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [wasteToStr, setWasteToStr] = useState<string>(toYmd(new Date()));

  // Attendance / HR Analytics — date-range only (AttendanceRecord.date is day-granularity).
  const [attSectionCollapsed, setAttSectionCollapsed] = useState<boolean>(false);
  const [attPreset, setAttPreset] = useState<string>("This Month");
  const [attFromStr, setAttFromStr] = useState<string>(toYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [attToStr, setAttToStr] = useState<string>(toYmd(new Date()));

  const setPreset = (preset: string) => {
    setChannelPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setChannelFromStr(toYmd(now));
      setChannelToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setChannelFromStr(toYmd(d));
      setChannelToStr(toYmd(now));
    } else if (preset === "This Month") {
      setChannelFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setChannelToStr(toYmd(now));
    }
  };

  const setCatRange = (preset: string) => {
    setCatPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setCatFromStr(toYmd(now));
      setCatToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setCatFromStr(toYmd(d));
      setCatToStr(toYmd(now));
    } else if (preset === "This Month") {
      setCatFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setCatToStr(toYmd(now));
    }
  };

  const setPayRange = (preset: string) => {
    setPayPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setPayFromStr(toYmd(now));
      setPayToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setPayFromStr(toYmd(d));
      setPayToStr(toYmd(now));
    } else if (preset === "This Month") {
      setPayFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setPayToStr(toYmd(now));
    }
  };

  const setItemsRange = (preset: string) => {
    setItemsPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setItemsFromStr(toYmd(now));
      setItemsToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setItemsFromStr(toYmd(d));
      setItemsToStr(toYmd(now));
    } else if (preset === "This Month") {
      setItemsFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setItemsToStr(toYmd(now));
    }
  };

  const setNpRange = (preset: string) => {
    setNpPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setNpFromStr(toYmd(now));
      setNpToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setNpFromStr(toYmd(d));
      setNpToStr(toYmd(now));
    } else if (preset === "This Month") {
      setNpFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setNpToStr(toYmd(now));
    }
  };

  const setStaffRange = (preset: string) => {
    setStaffPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setStaffFromStr(toYmd(now));
      setStaffToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setStaffFromStr(toYmd(d));
      setStaffToStr(toYmd(now));
    } else if (preset === "This Month") {
      setStaffFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setStaffToStr(toYmd(now));
    }
  };

  const setBranchRange = (preset: string) => {
    setBranchPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setBranchFromStr(toYmd(now));
      setBranchToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setBranchFromStr(toYmd(d));
      setBranchToStr(toYmd(now));
    } else if (preset === "This Month") {
      setBranchFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setBranchToStr(toYmd(now));
    }
  };

  const setCrRange = (preset: string) => {
    setCrPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setCrFromStr(toYmd(now));
      setCrToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setCrFromStr(toYmd(d));
      setCrToStr(toYmd(now));
    } else if (preset === "This Month") {
      setCrFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setCrToStr(toYmd(now));
    }
  };

  const setPRange = (preset: string) => {
    setPPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setPFromStr(toYmd(now));
      setPToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setPFromStr(toYmd(d));
      setPToStr(toYmd(now));
    } else if (preset === "This Month") {
      setPFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setPToStr(toYmd(now));
    }
  };

  const setDpRange = (preset: string) => {
    setDpPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setDpFromStr(toYmd(now));
      setDpToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setDpFromStr(toYmd(d));
      setDpToStr(toYmd(now));
    } else if (preset === "This Month") {
      setDpFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setDpToStr(toYmd(now));
    }
  };

  const setExpRange = (preset: string) => {
    setExpPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setExpFromStr(toYmd(now));
      setExpToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setExpFromStr(toYmd(d));
      setExpToStr(toYmd(now));
    } else if (preset === "This Month") {
      setExpFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setExpToStr(toYmd(now));
    }
  };

  const setWasteRange = (preset: string) => {
    setWastePreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setWasteFromStr(toYmd(now));
      setWasteToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setWasteFromStr(toYmd(d));
      setWasteToStr(toYmd(now));
    } else if (preset === "This Month") {
      setWasteFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setWasteToStr(toYmd(now));
    }
  };

  const setAttRange = (preset: string) => {
    setAttPreset(preset);
    const now = new Date();
    if (preset === "Today") {
      setAttFromStr(toYmd(now));
      setAttToStr(toYmd(now));
    } else if (preset === "This Week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setAttFromStr(toYmd(d));
      setAttToStr(toYmd(now));
    } else if (preset === "This Month") {
      setAttFromStr(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setAttToStr(toYmd(now));
    }
  };

  const { data: channelData, isLoading: channelLoading } = useQuery({
    queryKey: [
      "sales-by-channel",
      outletId,
      channelFromStr,
      channelToStr,
      channelTimeFrom,
      channelTimeTo,
    ],
    queryFn: () =>
      reportService.getSalesByChannel({
        outletId,
        from: channelFromStr,
        to: channelToStr,
        fromTime: channelTimeFrom || undefined,
        toTime: channelTimeTo || undefined,
      }),
    enabled: salesByChannelVisible,
  });

  const { data: categoryData, isLoading: categoryLoading } = useQuery({
    queryKey: ["sales-by-category", outletId, catFromStr, catToStr, catTimeFrom, catTimeTo],
    queryFn: () =>
      reportService.getSalesByCategory({
        outletId,
        from: catFromStr,
        to: catToStr,
        fromTime: catTimeFrom || undefined,
        toTime: catTimeTo || undefined,
      }),
    enabled: salesByChannelVisible,
  });

  const { data: payData, isLoading: payLoading } = useQuery({
    queryKey: ["sales-by-payment-method", outletId, payFromStr, payToStr, payTimeFrom, payTimeTo],
    queryFn: () =>
      reportService.getSalesByPaymentMethod({
        outletId,
        from: payFromStr,
        to: payToStr,
        fromTime: payTimeFrom || undefined,
        toTime: payTimeTo || undefined,
      }),
    enabled: salesByChannelVisible,
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["top-items", outletId, itemsFromStr, itemsToStr, itemsTimeFrom, itemsTimeTo],
    queryFn: () =>
      reportService.getTopItems({
        outletId,
        from: itemsFromStr,
        to: itemsToStr,
        fromTime: itemsTimeFrom || undefined,
        toTime: itemsTimeTo || undefined,
      }),
    enabled: salesByChannelVisible,
  });

  const { data: npData, isLoading: npLoading } = useQuery({
    queryKey: ["net-profit", outletId, npFromStr, npToStr],
    queryFn: () => reportService.getNetProfit({ outletId, from: npFromStr, to: npToStr }),
    enabled: salesByChannelVisible,
  });

  const { data: dpData, isLoading: dpLoading } = useQuery({
    queryKey: ["deals-performance", outletId, dpFromStr, dpToStr],
    queryFn: () => reportService.getDealsPerformance({ outletId, from: dpFromStr, to: dpToStr }),
    enabled: salesByChannelVisible,
  });

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ["sales-by-staff", outletId, staffFromStr, staffToStr, staffTimeFrom, staffTimeTo],
    queryFn: () =>
      reportService.getSalesByStaff({
        outletId,
        from: staffFromStr,
        to: staffToStr,
        fromTime: staffTimeFrom || undefined,
        toTime: staffTimeTo || undefined,
      }),
    enabled: salesByChannelVisible,
  });

  const branchSectionVisible = salesByChannelVisible && isSuperAdmin && outletId === "all";
  const { data: branchData, isLoading: branchLoading } = useQuery({
    queryKey: ["sales-by-outlet", branchFromStr, branchToStr],
    queryFn: () => reportService.getSalesByOutlet({ outletId, from: branchFromStr, to: branchToStr }),
    enabled: branchSectionVisible,
  });

  const { data: crData, isLoading: crLoading } = useQuery({
    queryKey: ["cancellation-requests", outletId, crFromStr, crToStr],
    queryFn: () => reportService.getCancellationRequestsReport({ outletId, from: crFromStr, to: crToStr }),
    enabled: salesByChannelVisible,
  });

  const { data: pData, isLoading: pLoading } = useQuery({
    queryKey: ["purchases-by-supplier", outletId, pFromStr, pToStr],
    queryFn: () => reportService.getPurchasesBySupplier({ outletId, from: pFromStr, to: pToStr }),
    enabled: salesByChannelVisible,
  });

  const { data: expData, isLoading: expLoading } = useQuery({
    queryKey: ["expenses-breakdown", outletId, expFromStr, expToStr],
    queryFn: () => reportService.getExpensesBreakdown({ outletId, from: expFromStr, to: expToStr }),
    enabled: salesByChannelVisible,
  });

  const { data: wasteData, isLoading: wasteLoading } = useQuery({
    queryKey: ["waste-breakdown", outletId, wasteFromStr, wasteToStr],
    queryFn: () => reportService.getWasteBreakdown({ outletId, from: wasteFromStr, to: wasteToStr }),
    enabled: salesByChannelVisible,
  });

  const { data: attData, isLoading: attLoading } = useQuery({
    queryKey: ["attendance-analytics", outletId, attFromStr, attToStr],
    queryFn: () => reportService.getAttendanceAnalytics({ outletId, from: attFromStr, to: attToStr }),
    enabled: salesByChannelVisible,
  });

  // Push-first real-time for the ten filtered sales/ops sections — invalidating just their own
  // query keys (not the whole ["dashboard", outletId] query) avoids re-running the other 11
  // dashboard aggregates on every order event, matching how Sales.tsx keeps its order-list query
  // independent. The 180s poll (this app's standard interval for socket-backed page data) is a
  // safety net only. Cancellation Requests / Purchases also refresh on their own module socket
  // events (separate useModuleEvents calls below) since order events alone don't cover either.
  const refreshSalesSections = () => {
    if (!salesByChannelVisible) return;
    queryClient.invalidateQueries({ queryKey: ["sales-by-channel"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-category"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-payment-method"] });
    queryClient.invalidateQueries({ queryKey: ["top-items"] });
    queryClient.invalidateQueries({ queryKey: ["net-profit"] });
    queryClient.invalidateQueries({ queryKey: ["deals-performance"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-staff"] });
    queryClient.invalidateQueries({ queryKey: ["sales-by-outlet"] });
    queryClient.invalidateQueries({ queryKey: ["cancellation-requests"] });
    queryClient.invalidateQueries({ queryKey: ["purchases-by-supplier"] });
    queryClient.invalidateQueries({ queryKey: ["expenses-breakdown"] });
    queryClient.invalidateQueries({ queryKey: ["waste-breakdown"] });
  };
  useModuleEvents(["cancellationRequest:created", "cancellationRequest:updated"], refreshSalesSections);
  useModuleEvents(["purchase:created", "purchase:updated", "purchase:deleted"], refreshSalesSections);
  useOrderEvents(refreshSalesSections);
  useVisiblePolling(refreshSalesSections, 180_000);

  const { data: doughBatches = [], refetch: refetchDough } = useQuery({
    queryKey: ["dough-batches", outletId],
    queryFn: () => stockService.getDoughBatches({ outletId }),
  });
  useVisiblePolling(() => { refetchDough(); }, 30000);
  // 1-minute client tick so the countdown numbers update live without network calls
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);
  const liveMins = (expiresAt: string) => { const ms = new Date(expiresAt).getTime() - Date.now(); return ms <= 0 ? 0 : Math.floor(ms / 60000); };
  const fmtLeft = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m left`;
  const wasteBatch = async (id: string) => { await stockService.wasteDoughBatch(id); refetchDough(); };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><Skeleton className="lg:col-span-2 h-72" /><Skeleton className="h-72" /></div>
    </div>
  );

  // --- Customer Intelligence chart transforms — all derived from DashboardReport fields
  // already fetched above, never a client-side raw-order pull. ---
  const peakHoursChart = (d?.peakHours ?? []).map(p => ({ hour: `${p.hour}:00`, orders: p.orders, revenue: p.revenue }));
  const customerActivityChart = d?.customerActivity ?? [];
  const dayPerformanceChart = d?.dayOfWeekPerformance ?? [];
  // Mirrors reports.helpers.ts's ONLINE_TYPES on the backend — the two repos share no code,
  // so this short list is kept in sync by hand, same as this file's own channel handling.
  const ONLINE_TYPES = ["Foodpanda", "Online", "Self Order"];
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const orderTypeTrendChart = (() => {
    const byDay = new Map(weekdayLabels.map(l => [l, { day: l, online: 0, offline: 0 }]));
    for (const row of d?.orderTypeTrend ?? []) {
      const bucket = byDay.get(row.day);
      if (!bucket) continue;
      if (ONLINE_TYPES.includes(row.type)) bucket.online += row.count; else bucket.offline += row.count;
    }
    return [...byDay.values()];
  })();
  // Exact count, not an estimate: customerActivity's newCustomers is 1 exactly once per
  // customer (their first day in the week), so summing it across all 7 days gives the
  // week's unique-customer total with zero extra queries.
  const uniqueCustomersThisWeek = (d?.customerActivity ?? []).reduce((s, day) => s + day.newCustomers, 0);

  const channelRows = [
    {
      title: "Dine In",
      icon: UtensilsCrossed,
      color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      orders: channelData?.channels.dineIn.orders ?? 0,
      sale: channelData?.channels.dineIn.sale ?? 0,
      cost: channelData?.channels.dineIn.cost ?? 0,
      profit: channelData?.channels.dineIn.profit ?? 0,
      marginPct:
        (channelData?.channels.dineIn.sale ?? 0) > 0
          ? Math.round(((channelData?.channels.dineIn.profit ?? 0) / (channelData?.channels.dineIn.sale ?? 1)) * 100)
          : 0,
      isCombined: false,
      salesTypeParam: "Dine In",
    },
    {
      title: "Take Away",
      icon: ShoppingBag,
      color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      orders: channelData?.channels.takeaway.orders ?? 0,
      sale: channelData?.channels.takeaway.sale ?? 0,
      cost: channelData?.channels.takeaway.cost ?? 0,
      profit: channelData?.channels.takeaway.profit ?? 0,
      marginPct:
        (channelData?.channels.takeaway.sale ?? 0) > 0
          ? Math.round(((channelData?.channels.takeaway.profit ?? 0) / (channelData?.channels.takeaway.sale ?? 1)) * 100)
          : 0,
      isCombined: false,
      salesTypeParam: "Take Away",
    },
    {
      title: "Delivery",
      icon: Bike,
      color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      orders: channelData?.channels.delivery.orders ?? 0,
      sale: channelData?.channels.delivery.sale ?? 0,
      cost: channelData?.channels.delivery.cost ?? 0,
      profit: channelData?.channels.delivery.profit ?? 0,
      marginPct:
        (channelData?.channels.delivery.sale ?? 0) > 0
          ? Math.round(((channelData?.channels.delivery.profit ?? 0) / (channelData?.channels.delivery.sale ?? 1)) * 100)
          : 0,
      isCombined: false,
      salesTypeParam: "Delivery",
    },
    {
      title: "Total (All Channels)",
      icon: TrendingUp,
      color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      orders: channelData?.combined.orders ?? 0,
      sale: channelData?.combined.sale ?? 0,
      cost: channelData?.combined.cost ?? 0,
      profit: channelData?.combined.profit ?? 0,
      marginPct: channelData?.combined.marginPct ?? 0,
      isCombined: true,
      // The 3 real channels this section sums, not "every type" -- Sales & Orders' own "All"
      // would also pull in Online/Foodpanda, which Sales By Channel deliberately excludes.
      salesTypeParam: "Dine In,Take Away,Delivery",
    },
  ];
  // Chart data: the 3 real channels only -- the combined row is a summary total, not a
  // fourth channel, and would double-count if plotted alongside them.
  const channelChartData = channelRows.filter((r) => !r.isCombined).map((r) => ({
    name: r.title, sale: r.sale, cost: r.cost, profit: r.profit,
  }));
  const salesTypeParamByChannel = new Map(channelRows.map((r) => [r.title, r.salesTypeParam]));

  // "View Details" on any channel row/chart bar -- lands on Sales & Orders pre-filtered to
  // exactly what that row totalled: the same date/time window this section has active, status
  // narrowed to completed only (this section's own aggregate never counts cancelled orders,
  // unlike Sales & Orders' default "All"), and the given type(s).
  const goToChannelSales = (salesTypeParam: string) => {
    const params = new URLSearchParams();
    params.set("status", "completed");
    params.set("type", salesTypeParam);
    if (channelFromStr) params.set("from", channelFromStr);
    if (channelToStr) params.set("to", channelToStr);
    if (channelTimeFrom) params.set("fromTime", channelTimeFrom);
    if (channelTimeTo) params.set("toTime", channelTimeTo);
    navigate(`/sales?${params.toString()}`);
  };

  // ── Sales by Category derivations ────────────────────────────────────────
  const categoryList = categoryData?.categories ?? [];
  const categoryCombined = categoryData?.combined;
  // The table shows every active category (incl. zero-sales ones, muted); the chart plots only
  // categories that actually sold — a wall of Rs. 0 bars is noise.
  const categoryWithSales = categoryList.filter((c) => c.sale > 0);
  // A 15-category bar chart is unreadable — plot the top 8 by Sale and fold the rest into
  // one "Other" bar (kept out of the drill-down: "Other" has no single category param).
  const CATEGORY_CHART_TOP_N = 8;
  const catChartData = (() => {
    const top = categoryWithSales
      .slice(0, CATEGORY_CHART_TOP_N)
      .map((c) => ({ name: c.name, sale: c.sale, cost: c.cost, profit: c.profit }));
    const rest = categoryWithSales.slice(CATEGORY_CHART_TOP_N);
    if (rest.length > 0) {
      top.push({
        name: "Other",
        sale: rest.reduce((s, c) => s + c.sale, 0),
        cost: rest.reduce((s, c) => s + c.cost, 0),
        profit: rest.reduce((s, c) => s + c.profit, 0),
      });
    }
    return top;
  })();

  // "View Details" → Sales & Orders pre-filtered to this category (same date/time window,
  // status=completed). A null name (the Total row) drops the category param → every completed
  // sale in the window, all channels — matching the combined row's scope. Sales.tsx reads
  // these params once on mount, then leaves the address bar alone.
  const goToCategorySales = (categoryName: string | null) => {
    const params = new URLSearchParams();
    params.set("status", "completed");
    if (categoryName) params.set("category", categoryName);
    if (catFromStr) params.set("from", catFromStr);
    if (catToStr) params.set("to", catToStr);
    if (catTimeFrom) params.set("fromTime", catTimeFrom);
    if (catTimeTo) params.set("toTime", catTimeTo);
    navigate(`/sales?${params.toString()}`);
  };

  // ── Sales by Payment Method derivations ──────────────────────────────────
  const payMethods = payData?.methods ?? [];
  const payCombined = payData?.combined;
  // Table shows every configured method (incl. zero, muted); chart plots only methods that
  // actually collected something.
  const payChartData = payMethods.filter((m) => m.amount > 0).map((m) => ({ name: m.method, amount: m.amount }));
  const payHasActivity = (payCombined?.amount ?? 0) > 0;
  // "View Details" → Sales & Orders filtered to orders that used this method (whole-order
  // amounts; a split order also shows under its other methods). Total row → no method param.
  const goToPaymentSales = (method: string | null) => {
    const params = new URLSearchParams();
    params.set("status", "completed");
    if (method) params.set("paymentMethod", method);
    if (payFromStr) params.set("from", payFromStr);
    if (payToStr) params.set("to", payToStr);
    if (payTimeFrom) params.set("fromTime", payTimeFrom);
    if (payTimeTo) params.set("toTime", payTimeTo);
    navigate(`/sales?${params.toString()}`);
  };

  // ── Top & Bottom Items derivations ──────────────────────────────────────
  const topItems = itemsData?.topItems ?? [];
  const bottomItems = itemsData?.bottomItems ?? [];
  const totalItemsSold = itemsData?.totalItems ?? 0;
  // With ≤ 10 distinct items sold, top and bottom are the same list in opposite order —
  // showing both is just noise, so the Underperformers table is hidden below that.
  const showBottomItems = totalItemsSold > topItems.length;

  const itemTableHead = (
    <TableHeader>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableHead className="w-8">#</TableHead>
        <TableHead>Item</TableHead>
        <TableHead className="text-right">Qty</TableHead>
        <TableHead className="text-right">Sale</TableHead>
        <TableHead className="text-right">Cost</TableHead>
        <TableHead className="text-right">Profit</TableHead>
        <TableHead className="text-right">Margin</TableHead>
      </TableRow>
    </TableHeader>
  );
  const renderItemRows = (rows: typeof topItems) =>
    rows.map((it, idx) => (
      <TableRow key={it.menuItemId} className="hover:bg-muted/30">
        <TableCell className="text-muted-foreground text-xs w-8">{idx + 1}</TableCell>
        <TableCell className="font-medium">{it.name}</TableCell>
        <TableCell className="text-right text-muted-foreground">{it.qty}</TableCell>
        <TableCell className="text-right">{currency} {it.sale.toLocaleString()}</TableCell>
        <TableCell className="text-right">{currency} {it.cost.toLocaleString()}</TableCell>
        <TableCell className={cn("text-right font-medium", it.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
          {currency} {it.profit.toLocaleString()}
        </TableCell>
        <TableCell className={cn("text-right", it.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
          {it.marginPct}%
        </TableCell>
      </TableRow>
    ));

  // ── Net Profit derivations ──────────────────────────────────────────────
  const np = npData;
  const money = (n: number) => `${currency} ${Math.abs(n).toLocaleString()}`;
  // Drill-downs for the P&L waterfall rows — same date window, no time-of-day (none of the
  // three destination pages filter by time). Sales.tsx / Expenses.tsx / StockAdjustments.tsx
  // each read these params once on mount, exactly like the other four sections' drill-downs.
  const goToRevenueSales = () => {
    const params = new URLSearchParams({ status: "completed", from: npFromStr, to: npToStr });
    navigate(`/sales?${params.toString()}`);
  };
  const goToExpenses = (category?: string) => {
    const params = new URLSearchParams({ from: npFromStr, to: npToStr });
    if (category) params.set("category", category);
    navigate(`/expenses?${params.toString()}`);
  };
  const goToWaste = (reason?: string) => {
    const params = new URLSearchParams({ from: npFromStr, to: npToStr });
    if (reason) params.set("reason", reason);
    navigate(`/stock/adjustments?${params.toString()}`);
  };
  // Same 6-line P&L as the text waterfall above, charted. COGS/Food Loss/Expenses are always
  // >= 0 (magnitudes, never negative) and plotted as plain bars like every other chart on this
  // dashboard -- an earlier signed-bar version (dipping below zero) fought Recharts' negative-bar
  // label placement and looked squashed. Only Gross Profit/Net Profit can legitimately go
  // negative (a loss period); colored by sign, same treatment as "Profit by Channel" above. No
  // drill-down on the bars themselves; the waterfall rows already cover it.
  const npChartData = np ? [
    { name: "Revenue", value: np.revenue, isCost: false },
    { name: "COGS", value: np.cogs, isCost: true },
    { name: "Gross Profit", value: np.grossProfit, isCost: false },
    { name: "Food Loss", value: np.foodLoss, isCost: true },
    { name: "Expenses", value: np.expenses, isCost: true },
    { name: "Net Profit", value: np.netProfit, isCost: false },
  ] : [];

  // ── Expenses Breakdown & Trends derivations ──────────────────────────────
  const exp = expData;
  // Category row / bar drill-down -- same destination + param shape as Net Profit's own
  // goToExpenses(category?) above, but keyed to this section's own date window, not npFromStr/To.
  const goToExpCategory = (category?: string) => {
    const params = new URLSearchParams({ from: expFromStr, to: expToStr });
    if (category) params.set("category", category);
    navigate(`/expenses?${params.toString()}`);
  };
  // Trend point drill-down -- one specific day.
  const goToExpDay = (date: string) => {
    const params = new URLSearchParams({ from: date, to: date });
    navigate(`/expenses?${params.toString()}`);
  };
  const expCategoryChartData = (exp?.byCategory ?? []).filter((c) => c.amount > 0);
  // Trend chart's x-axis label -- "Sep 12" style, short enough not to collide at 30-31 points.
  const expTrendChartData = (exp?.trend ?? []).map((t) => ({
    ...t,
    label: new Date(`${t.date}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  }));

  // ── Waste / Food Loss Trends derivations ─────────────────────────────────
  const waste = wasteData;
  // Row/bar/point drill-down -- lands on Stock Adjustments--Waste, pre-filtered to this
  // section's own date window (same param shape Net Profit's goToWaste uses, but keyed to
  // wasteFromStr/wasteToStr, not npFromStr/npToStr).
  const goToWasteReason = (reason?: string) => {
    const params = new URLSearchParams({ from: wasteFromStr, to: wasteToStr });
    if (reason) params.set("reason", reason);
    navigate(`/stock/adjustments?${params.toString()}`);
  };
  const goToWasteDay = (date: string) => {
    const params = new URLSearchParams({ from: date, to: date });
    navigate(`/stock/adjustments?${params.toString()}`);
  };
  const wasteReasonChartData = (waste?.byReason ?? []).filter((r) => r.amount > 0);
  const wasteTrendChartData = (waste?.trend ?? []).map((t) => ({
    ...t,
    label: new Date(`${t.date}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  }));

  // ── Deals Performance derivations ────────────────────────────────────────
  const dp = dpData;
  const DEAL_TYPE_LABELS: Record<string, string> = {
    COMBO: "Fixed Bundle",
    OPTION_COMBO: "Customizable Bundle",
    PERCENTAGE: "% Discount",
    BUY_X_GET_Y: "Buy X Get Y",
    PROMO_CODE: "Promo Code",
    MIN_SPEND: "Minimum Spend",
    LINE_DEAL: "Deal (deleted)",
    ORDER_DEAL: "Deal (deleted)",
  };
  const dealTypeLabel = (type: string) => DEAL_TYPE_LABELS[type] ?? type;
  const ORDER_LEVEL_DEAL_TYPES = new Set(["PROMO_CODE", "MIN_SPEND"]);
  // "View Details" on a deal row -- lands on Sales & Orders filtered to exactly that deal's
  // redemptions, same date window this section has active. `dealName` rides along display-only
  // (Sales.tsx's Deal <Select> is keyed by id, not name — a name isn't guaranteed unique across
  // a deleted+recreated deal) so the synthetic-option fallback shows a real name instead of a
  // bare UUID when the deal no longer appears in the live deals list.
  const goToDealSales = (dealId: string, dealName: string) => {
    const params = new URLSearchParams({
      status: "completed", deal: dealId, dealName, from: dpFromStr, to: dpToStr,
    });
    navigate(`/sales?${params.toString()}`);
  };
  // Top 8 by revenue for the chart — a bar per deal beyond that gets unreadably thin, and the
  // table below already lists every deal, ranked by redemptions.
  const dpChartData = (dp?.rows ?? [])
    .slice()
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((r) => ({ name: r.name, revenue: r.revenue }));

  // ── Sales by Staff derivations ───────────────────────────────────────────
  const staffChartData = (staffData?.rows ?? []).slice(0, 8).map((r) => ({ name: r.name, staffId: r.staffId, sale: r.sale, cost: r.cost, profit: r.profit }));
  // "View Details" on a staff row/bar -- lands on Sales & Orders pre-filtered to exactly what
  // that row totalled. No id (a historical "Unassigned" row) means no drill-down possible.
  const goToStaffSales = (staffId: string | null, staffName?: string) => {
    if (!staffId) return;
    const params = new URLSearchParams();
    params.set("status", "completed");
    params.set("staffId", staffId);
    if (staffName) params.set("staffName", staffName);
    if (staffFromStr) params.set("from", staffFromStr);
    if (staffToStr) params.set("to", staffToStr);
    if (staffTimeFrom) params.set("fromTime", staffTimeFrom);
    if (staffTimeTo) params.set("toTime", staffTimeTo);
    navigate(`/sales?${params.toString()}`);
  };

  // ── Sales by Outlet derivations ──────────────────────────────────────────
  const branchChartData = (branchData?.rows ?? []).slice(0, 8).map((r) => ({ name: r.name, outletId: r.outletId, sale: r.sale, cost: r.cost, profit: r.profit }));
  // Row/bar click switches the whole Dashboard's own outlet filter (useOutletFilter) to that
  // branch, rather than navigating to Sales & Orders — Sales.tsx has no outlet filter of its own
  // (Super Admin isn't wired there), and re-scoping the Dashboard is more useful anyway: every
  // other section on this page instantly re-filters to just that branch too.
  const goToBranch = (branchOutletId: string | null) => {
    if (!branchOutletId) return;
    setOutletId(branchOutletId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Cancellation Requests derivations ────────────────────────────────────
  const crReasonChartData = (crData?.byReason ?? []).map((r) => ({ name: r.reason, count: r.count, refunded: r.refunded }));
  // Tiles/chart-bars/staff-rows all land on /cancellation-requests pre-filtered to this
  // section's active date window. `status` defaults the page's own status tabs (which
  // otherwise default to "pending") — "all" for the whole-period tiles, "approved" for the
  // reason/staff breakdowns (those are computed from approved requests only on the backend).
  const goToCancellations = (opts?: { status?: string; reason?: string; responsibleUserId?: string; responsibleName?: string }) => {
    const params = new URLSearchParams();
    if (crFromStr) params.set("from", crFromStr);
    if (crToStr) params.set("to", crToStr);
    params.set("status", opts?.status ?? "all");
    if (opts?.reason) params.set("reason", opts.reason);
    if (opts?.responsibleUserId) params.set("responsibleUserId", opts.responsibleUserId);
    if (opts?.responsibleName) params.set("responsibleName", opts.responsibleName);
    navigate(`/cancellation-requests?${params.toString()}`);
  };

  // ── Purchases & Supplier Spend derivations ───────────────────────────────
  const pChartData = (pData?.rows ?? []).slice(0, 8).map((r) => ({ name: r.name, id: r.id, total: r.total, paid: r.paid, due: r.due }));
  const goToPurchases = (supplierId?: string | null) => {
    const params = new URLSearchParams();
    if (pFromStr) params.set("from", pFromStr);
    if (pToStr) params.set("to", pToStr);
    if (supplierId) params.set("supplierId", supplierId);
    navigate(`/purchases?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Fallback header when Sales By Channel is not visible */}
      {!salesByChannelVisible && (
        <div className="flex items-center justify-between pb-3 border-b border-border/40">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Dashboard</h2>
            <p className="text-xs text-muted-foreground">
              {d?.branchName ?? "Welcome back, here's your overview"}
            </p>
          </div>
          {isSuperAdmin && (
            <OutletFilterSelect outletId={outletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
          )}
        </div>
      )}

      {/* Sales By Channel (gated on "reports" permission) */}
      {salesByChannelVisible && (
        <section
          aria-label="Sales By Channel"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          {/* Section Header & Filter Controls Container */}
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !channelSectionCollapsed && "border-b border-border/50")}>
            {/* Top row: Title + Collapse Arrow + Super Admin OutletFilter */}
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setChannelSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <DollarSign className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Sales By Channel
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isSuperAdmin && (
                  <OutletFilterSelect outletId={outletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChannelSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={channelSectionCollapsed ? "Expand Sales By Channel" : "Collapse Sales By Channel"}
                  aria-label={channelSectionCollapsed ? "Expand Sales By Channel" : "Collapse Sales By Channel"}
                >
                  <span className="text-xs font-medium hidden sm:inline">
                    {channelSectionCollapsed ? "Show" : "Hide"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      channelSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {/* Filter Bar Row (only shown when expanded) */}
            {!channelSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                {/* Presets Segmented Control */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPreset(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        channelPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* Date Pickers (From -> To) */}
                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={channelFromStr}
                      onChange={(val) => {
                        setChannelFromStr(val);
                        setChannelPreset("Custom");
                      }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={channelToStr}
                      onChange={(val) => {
                        setChannelToStr(val);
                        setChannelPreset("Custom");
                      }}
                      min={channelFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                {/* Time Filter Popover */}
                <div className="inline-flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 text-xs font-medium gap-1.5 border shadow-sm transition-all",
                          channelTimeFrom || channelTimeTo
                            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                            : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Clock className={cn("h-3.5 w-3.5 shrink-0", (channelTimeFrom || channelTimeTo) && "text-primary")} />
                        <span>
                          {channelTimeFrom || channelTimeTo
                            ? `${channelTimeFrom ? formatTimeLabel(channelTimeFrom) : "12:00 AM"} – ${channelTimeTo ? formatTimeLabel(channelTimeTo) : "11:59 PM"}`
                            : "All Day (Time)"}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3 space-y-3" align="start">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span>Filter By Operating Hours</span>
                        </div>
                        {(channelTimeFrom || channelTimeTo) && (
                          <button
                            type="button"
                            onClick={() => {
                              setChannelTimeFrom("");
                              setChannelTimeTo("");
                            }}
                            className="text-[11px] text-destructive hover:underline font-medium"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      {/* Quick Shift Presets */}
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Quick Shift Presets</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Lunch Shift", from: "11:00", to: "17:00" },
                            { label: "Dinner Peak", from: "17:00", to: "23:59" },
                            { label: "Late Night", from: "23:00", to: "04:00" },
                            { label: "Full Operating Day", from: "11:00", to: "23:59" },
                          ].map((shift) => (
                            <Button
                              key={shift.label}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setChannelTimeFrom(shift.from);
                                setChannelTimeTo(shift.to);
                              }}
                              className={cn(
                                "h-7 text-[11px] justify-start px-2 font-normal border-border/60",
                                channelTimeFrom === shift.from && channelTimeTo === shift.to
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted"
                              )}
                            >
                              {shift.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Time Selection using TimePicker */}
                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground">Custom Time Range</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Start Time</label>
                            <TimePicker
                              value={channelTimeFrom || "11:00"}
                              onChange={(v) => setChannelTimeFrom(v)}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">End Time</label>
                            <TimePicker
                              value={channelTimeTo || "23:59"}
                              onChange={(v) => setChannelTimeTo(v)}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {(channelTimeFrom || channelTimeTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setChannelTimeFrom("");
                        setChannelTimeTo("");
                      }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                      title="Clear time filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section Body: 4 Channel Rows nested inside this container */}
          {!channelSectionCollapsed && (
            <div className="p-4 sm:p-5 space-y-4 bg-background/25">
              {channelLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, r) => (
                    <div key={r} className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-7 w-7 rounded-md" />
                          <Skeleton className="h-5 w-28" />
                        </div>
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {Array.from({ length: 4 }).map((_, c) => (
                          <Skeleton key={c} className="h-20 rounded-lg" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {channelRows.map((row) => {
                    const ChannelIcon = row.icon;
                    return (
                      <div
                        key={row.title}
                        className={cn(
                          "group/card rounded-xl border p-4 transition-all duration-200 space-y-3",
                          row.isCombined
                            ? "bg-emerald-500/[0.03] border-emerald-500/30 shadow-xs hover:border-emerald-500/50 hover:bg-emerald-500/[0.05]"
                            : "bg-card/60 border-border/60 hover:border-border/90 hover:bg-card/80"
                        )}
                      >
                        {/* Channel Title + Orders Row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                "h-7 w-7 rounded-md flex items-center justify-center shrink-0 border shadow-2xs transition-transform duration-200 group-hover/card:scale-105",
                                row.color
                              )}
                            >
                              <ChannelIcon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-foreground tracking-tight">{row.title}</h4>
                              {row.isCombined && (
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                  Summary Total
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground font-medium bg-muted/60 px-2.5 py-0.5 rounded-full border border-border/50">
                              {row.orders} {row.orders === 1 ? "order" : "orders"}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => goToChannelSales(row.salesTypeParam)}
                              className="h-7 px-2.5 text-xs font-medium gap-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-lg"
                            >
                              <span>View Details</span>
                              <ChevronRight className="h-3 w-3 transition-transform duration-200 group-hover/card:translate-x-0.5" />
                            </Button>
                          </div>
                        </div>

                        {/* 4 Metrics in Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Metric 1: Total Sales */}
                          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Sales</p>
                              <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                                {currency} {row.sale.toLocaleString()}
                              </p>
                            </div>
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary border border-primary/20 shrink-0">
                              <DollarSign className="h-4 w-4" />
                            </div>
                          </div>

                          {/* Metric 2: Total Cost */}
                          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Cost</p>
                              <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                                {currency} {row.cost.toLocaleString()}
                              </p>
                            </div>
                            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-muted/80 text-muted-foreground border border-border/50 shrink-0">
                              <Wallet className="h-4 w-4" />
                            </div>
                          </div>

                          {/* Metric 3: Total Profit */}
                          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Profit</p>
                              <p className={cn("text-xl font-bold tracking-tight mt-0.5", row.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                                {currency} {row.profit.toLocaleString()}
                              </p>
                            </div>
                            <div
                              className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                                row.profit >= 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                              )}
                            >
                              <Coins className="h-4 w-4" />
                            </div>
                          </div>

                          {/* Metric 4: Profit Margin */}
                          <div className="rounded-lg bg-background/70 border border-border/50 p-3.5 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Profit Margin</p>
                              <p className={cn("text-xl font-bold tracking-tight mt-0.5", row.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                                {row.marginPct}%
                              </p>
                            </div>
                            <div
                              className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border",
                                row.marginPct >= 0 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"
                              )}
                            >
                              <Percent className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Charts: Sale vs Cost (2 series, validated categorical pair) and Profit
                      (1 series, colored by sign -- a status signal, not identity, so it's
                      reinforced with direct value labels + a legend key rather than color
                      alone). Same 3 channels as the cards above, same date/time filters. */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <p className="text-sm font-semibold text-foreground mb-3">Sale vs Cost by Channel</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channelChartData} barGap={4} barCategoryGap="24%">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                              dataKey="sale" name="Sale" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40}
                              cursor="pointer"
                              onClick={(data: any) => { const p = salesTypeParamByChannel.get(data?.name); if (p) goToChannelSales(p); }}
                            />
                            <Bar
                              dataKey="cost" name="Cost" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} maxBarSize={40}
                              cursor="pointer"
                              onClick={(data: any) => { const p = salesTypeParamByChannel.get(data?.name); if (p) goToChannelSales(p); }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-foreground">Profit by Channel</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Profit</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive" />Loss</span>
                        </div>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channelChartData} barCategoryGap="30%" margin={{ top: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Bar
                              dataKey="profit" name="Profit" radius={[4, 4, 0, 0]} maxBarSize={48}
                              cursor="pointer"
                              onClick={(data: any) => { const p = salesTypeParamByChannel.get(data?.name); if (p) goToChannelSales(p); }}
                            >
                              {channelChartData.map((entry) => (
                                <Cell key={entry.name} fill={entry.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                              ))}
                              <LabelList
                                dataKey="profit"
                                position="top"
                                formatter={(v: number) => `${currency} ${v.toLocaleString()}`}
                                style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Sales by Category (same "reports" permission gate as Sales By Channel) */}
      {salesByChannelVisible && (
        <section
          aria-label="Sales by Category"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !catSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setCatSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <Layers className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Sales by Category
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCatSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={catSectionCollapsed ? "Expand Sales by Category" : "Collapse Sales by Category"}
                  aria-label={catSectionCollapsed ? "Expand Sales by Category" : "Collapse Sales by Category"}
                >
                  <span className="text-xs font-medium hidden sm:inline">
                    {catSectionCollapsed ? "Show" : "Hide"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      catSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!catSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCatRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        catPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={catFromStr}
                      onChange={(val) => { setCatFromStr(val); setCatPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={catToStr}
                      onChange={(val) => { setCatToStr(val); setCatPreset("Custom"); }}
                      min={catFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="inline-flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 text-xs font-medium gap-1.5 border shadow-sm transition-all",
                          catTimeFrom || catTimeTo
                            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                            : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Clock className={cn("h-3.5 w-3.5 shrink-0", (catTimeFrom || catTimeTo) && "text-primary")} />
                        <span>
                          {catTimeFrom || catTimeTo
                            ? `${catTimeFrom ? formatTimeLabel(catTimeFrom) : "12:00 AM"} – ${catTimeTo ? formatTimeLabel(catTimeTo) : "11:59 PM"}`
                            : "All Day (Time)"}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3 space-y-3" align="start">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span>Filter By Operating Hours</span>
                        </div>
                        {(catTimeFrom || catTimeTo) && (
                          <button
                            type="button"
                            onClick={() => { setCatTimeFrom(""); setCatTimeTo(""); }}
                            className="text-[11px] text-destructive hover:underline font-medium"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Quick Shift Presets</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Lunch Shift", from: "11:00", to: "17:00" },
                            { label: "Dinner Peak", from: "17:00", to: "23:59" },
                            { label: "Late Night", from: "23:00", to: "04:00" },
                            { label: "Full Operating Day", from: "11:00", to: "23:59" },
                          ].map((shift) => (
                            <Button
                              key={shift.label}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => { setCatTimeFrom(shift.from); setCatTimeTo(shift.to); }}
                              className={cn(
                                "h-7 text-[11px] justify-start px-2 font-normal border-border/60",
                                catTimeFrom === shift.from && catTimeTo === shift.to
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted"
                              )}
                            >
                              {shift.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground">Custom Time Range</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Start Time</label>
                            <TimePicker
                              value={catTimeFrom || "11:00"}
                              onChange={setCatTimeFrom}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">End Time</label>
                            <TimePicker
                              value={catTimeTo || "23:59"}
                              onChange={setCatTimeTo}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {(catTimeFrom || catTimeTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setCatTimeFrom(""); setCatTimeTo(""); }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                      title="Clear time filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {!catSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {categoryLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : categoryList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No sales in this period.</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto -mx-1 px-1">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Sale</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryList.map((c) => {
                          const empty = c.orders === 0 && c.sale === 0;
                          return (
                          <TableRow
                            key={c.name}
                            className={cn(
                              "cursor-pointer transition-colors group/row",
                              empty ? "opacity-55 hover:opacity-100 hover:bg-muted/40" : "hover:bg-primary/5"
                            )}
                            onClick={() => goToCategorySales(c.name)}
                          >
                            <TableCell className="font-medium">
                              {c.name}
                              {empty && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">no sales</span>}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{c.orders}</TableCell>
                            <TableCell className="text-right font-medium">{currency} {c.sale.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{currency} {c.cost.toLocaleString()}</TableCell>
                            <TableCell className={cn("text-right font-medium", empty ? "text-muted-foreground" : c.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {currency} {c.profit.toLocaleString()}
                            </TableCell>
                            <TableCell className={cn("text-right", empty ? "text-muted-foreground" : c.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {empty ? "—" : `${c.marginPct}%`}
                            </TableCell>
                            <TableCell className="w-8">
                              <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover/row:text-primary group-hover/row:translate-x-0.5" />
                            </TableCell>
                          </TableRow>
                          );
                        })}
                        {categoryCombined && (
                          <TableRow
                            className="cursor-pointer border-t-2 border-emerald-500/30 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] font-semibold group/row"
                            onClick={() => goToCategorySales(null)}
                          >
                            <TableCell className="font-bold">
                              Total
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 ml-1.5">All Categories</span>
                            </TableCell>
                            <TableCell className="text-right">{categoryCombined.orders}</TableCell>
                            <TableCell className="text-right">{currency} {categoryCombined.sale.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{currency} {categoryCombined.cost.toLocaleString()}</TableCell>
                            <TableCell className={cn("text-right", categoryCombined.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {currency} {categoryCombined.profit.toLocaleString()}
                            </TableCell>
                            <TableCell className={cn("text-right", categoryCombined.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {categoryCombined.marginPct}%
                            </TableCell>
                            <TableCell className="w-8">
                              <ChevronRight className="h-4 w-4 text-emerald-500/50 transition-transform group-hover/row:translate-x-0.5" />
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Charts: top 8 categories that actually sold + "Other". Sale/Cost use this
                      app's one validated categorical pair (--primary / --info); Profit is
                      colored by sign (a status signal, not identity) and reinforced with direct
                      value labels + a legend key rather than color alone — same treatment as
                      Sales By Channel. Hidden entirely when nothing sold this period. */}
                  {catChartData.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <p className="text-sm font-semibold text-foreground mb-3">Sale vs Cost by Category</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={catChartData} barGap={4} barCategoryGap="24%">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                              dataKey="sale" name="Sale" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36}
                              cursor="pointer"
                              onClick={(data: any) => { if (data?.name && data.name !== "Other") goToCategorySales(data.name); }}
                            />
                            <Bar
                              dataKey="cost" name="Cost" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} maxBarSize={36}
                              cursor="pointer"
                              onClick={(data: any) => { if (data?.name && data.name !== "Other") goToCategorySales(data.name); }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-foreground">Profit by Category</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Profit</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive" />Loss</span>
                        </div>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={catChartData} barCategoryGap="30%" margin={{ top: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Bar
                              dataKey="profit" name="Profit" radius={[4, 4, 0, 0]} maxBarSize={44}
                              cursor="pointer"
                              onClick={(data: any) => { if (data?.name && data.name !== "Other") goToCategorySales(data.name); }}
                            >
                              {catChartData.map((entry) => (
                                <Cell key={entry.name} fill={entry.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                              ))}
                              <LabelList
                                dataKey="profit"
                                position="top"
                                formatter={(v: number) => `${currency} ${v.toLocaleString()}`}
                                style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Sales by Payment Method (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Sales by Payment Method"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !paySectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setPaySectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <CreditCard className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Sales by Payment Method
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPaySectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={paySectionCollapsed ? "Expand Sales by Payment Method" : "Collapse Sales by Payment Method"}
                  aria-label={paySectionCollapsed ? "Expand Sales by Payment Method" : "Collapse Sales by Payment Method"}
                >
                  <span className="text-xs font-medium hidden sm:inline">
                    {paySectionCollapsed ? "Show" : "Hide"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      paySectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!paySectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPayRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        payPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={payFromStr}
                      onChange={(val) => { setPayFromStr(val); setPayPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={payToStr}
                      onChange={(val) => { setPayToStr(val); setPayPreset("Custom"); }}
                      min={payFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="inline-flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 text-xs font-medium gap-1.5 border shadow-sm transition-all",
                          payTimeFrom || payTimeTo
                            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                            : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Clock className={cn("h-3.5 w-3.5 shrink-0", (payTimeFrom || payTimeTo) && "text-primary")} />
                        <span>
                          {payTimeFrom || payTimeTo
                            ? `${payTimeFrom ? formatTimeLabel(payTimeFrom) : "12:00 AM"} – ${payTimeTo ? formatTimeLabel(payTimeTo) : "11:59 PM"}`
                            : "All Day (Time)"}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3 space-y-3" align="start">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span>Filter By Operating Hours</span>
                        </div>
                        {(payTimeFrom || payTimeTo) && (
                          <button
                            type="button"
                            onClick={() => { setPayTimeFrom(""); setPayTimeTo(""); }}
                            className="text-[11px] text-destructive hover:underline font-medium"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Quick Shift Presets</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Lunch Shift", from: "11:00", to: "17:00" },
                            { label: "Dinner Peak", from: "17:00", to: "23:59" },
                            { label: "Late Night", from: "23:00", to: "04:00" },
                            { label: "Full Operating Day", from: "11:00", to: "23:59" },
                          ].map((shift) => (
                            <Button
                              key={shift.label}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => { setPayTimeFrom(shift.from); setPayTimeTo(shift.to); }}
                              className={cn(
                                "h-7 text-[11px] justify-start px-2 font-normal border-border/60",
                                payTimeFrom === shift.from && payTimeTo === shift.to
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted"
                              )}
                            >
                              {shift.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground">Custom Time Range</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Start Time</label>
                            <TimePicker
                              value={payTimeFrom || "11:00"}
                              onChange={setPayTimeFrom}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">End Time</label>
                            <TimePicker
                              value={payTimeTo || "23:59"}
                              onChange={setPayTimeTo}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {(payTimeFrom || payTimeTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPayTimeFrom(""); setPayTimeTo(""); }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                      title="Clear time filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {!paySectionCollapsed && (
            <div className="p-4 sm:p-5">
              {payLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : payMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No settled sales in this period.</p>
              ) : (
                <div className="space-y-4">
                  {/* Cash vs Digital tiles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-primary/[0.04] border border-primary/25 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cash Collected</p>
                        <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                          {currency} {(payCombined?.cashAmount ?? 0).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{payHasActivity ? `${payCombined?.cashSharePct ?? 0}% of collected` : "—"}</p>
                      </div>
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary border border-primary/20 shrink-0">
                        <Banknote className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="rounded-xl bg-info/[0.04] border border-info/25 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Digital Collected</p>
                        <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">
                          {currency} {(payCombined?.digitalAmount ?? 0).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{payHasActivity ? `${100 - (payCombined?.cashSharePct ?? 0)}% of collected` : "—"}</p>
                      </div>
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-info/10 text-info border border-info/20 shrink-0">
                        <Smartphone className="h-4 w-4" />
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto -mx-1 px-1">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">% of Total</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payMethods.map((m) => {
                          const empty = m.amount === 0 && m.orders === 0;
                          return (
                          <TableRow
                            key={m.method}
                            className={cn(
                              "cursor-pointer transition-colors group/row",
                              empty ? "opacity-55 hover:opacity-100 hover:bg-muted/40" : "hover:bg-primary/5"
                            )}
                            onClick={() => goToPaymentSales(m.method)}
                          >
                            <TableCell className="font-medium">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-sm shrink-0",
                                    m.method.toLowerCase() === "cash" ? "bg-primary" : "bg-info"
                                  )}
                                />
                                {m.method}
                                {empty && <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">no sales</span>}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{m.orders}</TableCell>
                            <TableCell className="text-right font-medium">{currency} {m.amount.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{empty ? "—" : `${m.sharePct}%`}</TableCell>
                            <TableCell className="w-8">
                              <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover/row:text-primary group-hover/row:translate-x-0.5" />
                            </TableCell>
                          </TableRow>
                          );
                        })}
                        {payCombined && (
                          <TableRow
                            className="cursor-pointer border-t-2 border-emerald-500/30 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08] font-semibold group/row"
                            onClick={() => goToPaymentSales(null)}
                          >
                            <TableCell className="font-bold">
                              Total
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 ml-1.5">All Methods</span>
                            </TableCell>
                            <TableCell className="text-right">{payCombined.orders}</TableCell>
                            <TableCell className="text-right">{currency} {payCombined.amount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">100%</TableCell>
                            <TableCell className="w-8">
                              <ChevronRight className="h-4 w-4 text-emerald-500/50 transition-transform group-hover/row:translate-x-0.5" />
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Amount by method — bars colored Cash (--primary) vs Digital (--info), the
                      validated categorical pair used here as a real 2-class encoding, with a
                      legend key + direct value labels. Hidden when nothing collected. */}
                  {payChartData.length > 0 && (
                  <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-foreground">Amount by Payment Method</p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" />Cash</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-info" />Digital</span>
                      </div>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={payChartData} barCategoryGap="28%" margin={{ top: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                          <Bar
                            dataKey="amount" name="Amount" radius={[4, 4, 0, 0]} maxBarSize={44}
                            cursor="pointer"
                            onClick={(data: any) => { if (data?.name) goToPaymentSales(data.name); }}
                          >
                            {payChartData.map((entry) => (
                              <Cell key={entry.name} fill={entry.name.toLowerCase() === "cash" ? "hsl(var(--primary))" : "hsl(var(--info))"} />
                            ))}
                            <LabelList
                              dataKey="amount"
                              position="top"
                              formatter={(v: number) => `${currency} ${v.toLocaleString()}`}
                              style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Top & Bottom Items (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Top and Bottom Items"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !itemsSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setItemsSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <Trophy className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Top &amp; Bottom Items
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setItemsSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={itemsSectionCollapsed ? "Expand Top & Bottom Items" : "Collapse Top & Bottom Items"}
                  aria-label={itemsSectionCollapsed ? "Expand Top & Bottom Items" : "Collapse Top & Bottom Items"}
                >
                  <span className="text-xs font-medium hidden sm:inline">
                    {itemsSectionCollapsed ? "Show" : "Hide"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      itemsSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!itemsSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setItemsRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        itemsPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={itemsFromStr}
                      onChange={(val) => { setItemsFromStr(val); setItemsPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={itemsToStr}
                      onChange={(val) => { setItemsToStr(val); setItemsPreset("Custom"); }}
                      min={itemsFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="inline-flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 text-xs font-medium gap-1.5 border shadow-sm transition-all",
                          itemsTimeFrom || itemsTimeTo
                            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                            : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Clock className={cn("h-3.5 w-3.5 shrink-0", (itemsTimeFrom || itemsTimeTo) && "text-primary")} />
                        <span>
                          {itemsTimeFrom || itemsTimeTo
                            ? `${itemsTimeFrom ? formatTimeLabel(itemsTimeFrom) : "12:00 AM"} – ${itemsTimeTo ? formatTimeLabel(itemsTimeTo) : "11:59 PM"}`
                            : "All Day (Time)"}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3 space-y-3" align="start">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span>Filter By Operating Hours</span>
                        </div>
                        {(itemsTimeFrom || itemsTimeTo) && (
                          <button
                            type="button"
                            onClick={() => { setItemsTimeFrom(""); setItemsTimeTo(""); }}
                            className="text-[11px] text-destructive hover:underline font-medium"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Quick Shift Presets</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Lunch Shift", from: "11:00", to: "17:00" },
                            { label: "Dinner Peak", from: "17:00", to: "23:59" },
                            { label: "Late Night", from: "23:00", to: "04:00" },
                            { label: "Full Operating Day", from: "11:00", to: "23:59" },
                          ].map((shift) => (
                            <Button
                              key={shift.label}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => { setItemsTimeFrom(shift.from); setItemsTimeTo(shift.to); }}
                              className={cn(
                                "h-7 text-[11px] justify-start px-2 font-normal border-border/60",
                                itemsTimeFrom === shift.from && itemsTimeTo === shift.to
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted"
                              )}
                            >
                              {shift.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground">Custom Time Range</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Start Time</label>
                            <TimePicker
                              value={itemsTimeFrom || "11:00"}
                              onChange={setItemsTimeFrom}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">End Time</label>
                            <TimePicker
                              value={itemsTimeTo || "23:59"}
                              onChange={setItemsTimeTo}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {(itemsTimeFrom || itemsTimeTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setItemsTimeFrom(""); setItemsTimeTo(""); }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                      title="Clear time filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {!itemsSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {itemsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 rounded-lg" />
                  ))}
                </div>
              ) : topItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No items sold in this period.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                    <div className="px-4 py-2.5 bg-emerald-500/[0.06] border-b border-emerald-500/20 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      <p className="text-sm font-semibold text-foreground">Top Performers</p>
                      <span className="text-[11px] text-muted-foreground">highest profit</span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        {itemTableHead}
                        <TableBody>{renderItemRows(topItems)}</TableBody>
                      </Table>
                    </div>
                  </div>

                  {showBottomItems ? (
                    <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                      <div className="px-4 py-2.5 bg-destructive/[0.05] border-b border-destructive/20 flex items-center gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                        <p className="text-sm font-semibold text-foreground">Underperformers</p>
                        <span className="text-[11px] text-muted-foreground">lowest profit first</span>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          {itemTableHead}
                          <TableBody>{renderItemRows(bottomItems)}</TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      Only {totalItemsSold} {totalItemsSold === 1 ? "item" : "items"} sold this period — the list above is the full ranking.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Net Profit (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Net Profit"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !npSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setNpSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <Coins className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                    Net Profit
                  </h2>
                  {npSectionCollapsed && np && (
                    <span
                      className={cn(
                        "text-xs font-semibold px-2.5 py-0.5 rounded-full border",
                        np.netProfit >= 0
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-destructive/10 text-destructive border-destructive/20"
                      )}
                    >
                      {np.netProfit < 0 ? "−" : ""}{money(np.netProfit)} • {np.netMarginPct}%
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNpSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={npSectionCollapsed ? "Expand Net Profit" : "Collapse Net Profit"}
                  aria-label={npSectionCollapsed ? "Expand Net Profit" : "Collapse Net Profit"}
                >
                  <span className="text-xs font-medium hidden sm:inline">{npSectionCollapsed ? "Show" : "Hide"}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      npSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!npSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNpRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        npPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={npFromStr}
                      onChange={(val) => { setNpFromStr(val); setNpPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={npToStr}
                      onChange={(val) => { setNpToStr(val); setNpPreset("Custom"); }}
                      min={npFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground/70">No time-of-day filter — expenses &amp; waste aren't hourly.</span>
              </div>
            )}
          </div>

          {!npSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {npLoading || !np ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
                  </div>
                  <Skeleton className="h-48 rounded-xl" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Headline tiles */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{money(np.revenue)}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gross Profit</p>
                      <p className={cn("text-xl font-bold tracking-tight mt-0.5", np.grossProfit >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {np.grossProfit < 0 ? "−" : ""}{money(np.grossProfit)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{np.grossMarginPct}% margin</p>
                    </div>
                    <div className={cn(
                      "rounded-lg border p-3.5",
                      np.netProfit >= 0 ? "bg-emerald-500/[0.04] border-emerald-500/25" : "bg-destructive/[0.04] border-destructive/25"
                    )}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net Profit</p>
                      <p className={cn("text-2xl font-bold tracking-tight mt-0.5", np.netProfit >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {np.netProfit < 0 ? "−" : ""}{money(np.netProfit)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net Margin</p>
                      <p className={cn("text-xl font-bold tracking-tight mt-0.5", np.netMarginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {np.netMarginPct}%
                      </p>
                    </div>
                  </div>

                  {/* P&L waterfall — Revenue/Food Loss/Expenses rows drill into Sales/Waste/
                      Expenses pages, pre-filtered to this section's exact date window. */}
                  <div className="rounded-xl border border-border/50 bg-card/40 divide-y divide-border/40 text-sm">
                    <div
                      className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors group/row"
                      onClick={goToRevenueSales}
                      title="View Details on Sales & Orders"
                    >
                      <span className="text-foreground inline-flex items-center gap-1">
                        Revenue
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 transition-transform group-hover/row:translate-x-0.5" />
                      </span>
                      <span className="font-medium tabular-nums">{money(np.revenue)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-muted-foreground">− COGS <span className="text-[11px]">(ingredient cost of food sold)</span></span>
                      <span className="tabular-nums text-muted-foreground">− {money(np.cogs)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                      <span className="font-semibold text-foreground">= Gross Profit</span>
                      <span className={cn("font-semibold tabular-nums", np.grossProfit >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {np.grossProfit < 0 ? "− " : ""}{money(np.grossProfit)} <span className="text-[11px] font-normal text-muted-foreground">({np.grossMarginPct}%)</span>
                      </span>
                    </div>
                    <div
                      className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors group/row"
                      onClick={() => goToWaste()}
                      title="View Details on Stock Adjustments — Waste"
                    >
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        − Food Loss <span className="text-[11px]">(expired / damaged / wasted stock)</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 transition-transform group-hover/row:translate-x-0.5" />
                      </span>
                      <span className="tabular-nums text-muted-foreground">− {money(np.foodLoss)}</span>
                    </div>
                    <div
                      className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors group/row"
                      onClick={() => goToExpenses()}
                      title="View Details on Expenses"
                    >
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        − Expenses <span className="text-[11px]">(rent / salary / utilities)</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40 transition-transform group-hover/row:translate-x-0.5" />
                      </span>
                      <span className="tabular-nums text-muted-foreground">− {money(np.expenses)}</span>
                    </div>
                    <div className={cn(
                      "flex items-center justify-between px-4 py-3",
                      np.netProfit >= 0 ? "bg-emerald-500/[0.06]" : "bg-destructive/[0.06]"
                    )}>
                      <span className="font-bold text-foreground">= Net Profit</span>
                      <span className={cn("font-bold text-base tabular-nums", np.netProfit >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {np.netProfit < 0 ? "− " : ""}{money(np.netProfit)} <span className="text-[11px] font-normal text-muted-foreground">({np.netMarginPct}%)</span>
                      </span>
                    </div>
                  </div>

                  {/* Net Profit Breakdown chart — same 6-line P&L as the waterfall above,
                      charted. COGS/Food Loss/Expenses are plotted as their magnitude (never
                      negative), same as every other bar chart on this dashboard — a plain,
                      always-clear-of-the-axis "top" label, no custom positioning needed. */}
                  <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-foreground">Net Profit Breakdown</p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Result</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive/50" />Cost</span>
                      </div>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={npChartData} barCategoryGap="24%" margin={{ top: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} />
                          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                          <Bar dataKey="value" name="Amount" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {npChartData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={
                                  entry.isCost
                                    ? "hsl(var(--destructive) / 0.5)"
                                    : entry.value >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"
                                }
                              />
                            ))}
                            <LabelList
                              dataKey="value"
                              position="top"
                              formatter={(v: number) => `${v < 0 ? "−" : ""}${money(v)}`}
                              style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Breakdowns — each row drills into its category/reason specifically. */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                      <div className="px-4 py-2.5 bg-muted/40 border-b border-border/40">
                        <p className="text-sm font-semibold text-foreground">Expenses by category</p>
                      </div>
                      <div className="divide-y divide-border/40 text-sm">
                        {np.expenseByCategory.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-muted-foreground">No expenses recorded this period.</p>
                        ) : (
                          np.expenseByCategory.map((e) => (
                            <div
                              key={e.name}
                              className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors group/row"
                              onClick={() => goToExpenses(e.name)}
                            >
                              <span className="text-muted-foreground truncate inline-flex items-center gap-1">
                                {e.name}
                                <ChevronRight className="h-3 w-3 text-muted-foreground/40 transition-transform group-hover/row:translate-x-0.5" />
                              </span>
                              <span className="tabular-nums font-medium">{money(e.value)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                      <div className="px-4 py-2.5 bg-muted/40 border-b border-border/40">
                        <p className="text-sm font-semibold text-foreground">Food loss by reason</p>
                      </div>
                      <div className="divide-y divide-border/40 text-sm">
                        {np.wasteByReason.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-muted-foreground">No waste recorded this period.</p>
                        ) : (
                          np.wasteByReason.map((w) => (
                            <div
                              key={w.name}
                              className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors group/row"
                              onClick={() => goToWaste(w.name)}
                            >
                              <span className="text-muted-foreground truncate inline-flex items-center gap-1">
                                {w.name}
                                <ChevronRight className="h-3 w-3 text-muted-foreground/40 transition-transform group-hover/row:translate-x-0.5" />
                              </span>
                              <span className="tabular-nums font-medium text-destructive">{money(w.value)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Purchases — context only */}
                  <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <Package className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      <span className="font-semibold text-foreground">Purchases this period: {money(np.purchases)}</span> — stock bought from suppliers.
                      Not subtracted above: it's inventory, and only counts as a cost as it's sold (COGS) or wasted (Food Loss).
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Expenses Breakdown & Trends (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Expenses Breakdown & Trends"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !expSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setExpSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <Receipt className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                    Expenses Breakdown &amp; Trends
                  </h2>
                  {expSectionCollapsed && exp && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
                      {money(exp.totalAmount)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={expSectionCollapsed ? "Expand Expenses Breakdown & Trends" : "Collapse Expenses Breakdown & Trends"}
                  aria-label={expSectionCollapsed ? "Expand Expenses Breakdown & Trends" : "Collapse Expenses Breakdown & Trends"}
                >
                  <span className="text-xs font-medium hidden sm:inline">{expSectionCollapsed ? "Show" : "Hide"}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      expSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!expSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setExpRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        expPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={expFromStr}
                      onChange={(val) => { setExpFromStr(val); setExpPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={expToStr}
                      onChange={(val) => { setExpToStr(val); setExpPreset("Custom"); }}
                      min={expFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground/70">No time-of-day filter — expenses aren't hourly.</span>
              </div>
            )}
          </div>

          {!expSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {expLoading || !exp ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
                  </div>
                  <Skeleton className="h-48 rounded-xl" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Headline tiles */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Expenses</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{money(exp.totalAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Transactions</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{exp.totalCount}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg / Day</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{money(exp.avgPerDay)}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top Category</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5 truncate">
                        {expCategoryChartData[0]?.name ?? "—"}
                      </p>
                      {expCategoryChartData[0] && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{money(expCategoryChartData[0].amount)}</p>
                      )}
                    </div>
                  </div>

                  {/* Trend over time */}
                  <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                    <p className="text-sm font-semibold text-foreground mb-3">Daily Trend</p>
                    {expTrendChartData.every((t) => t.amount === 0) ? (
                      <p className="text-xs text-muted-foreground py-8 text-center">No expenses recorded this period.</p>
                    ) : (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={expTrendChartData}
                            margin={{ top: 10, right: 10 }}
                            onClick={(state) => {
                              const p = state?.activePayload?.[0]?.payload as { date: string } | undefined;
                              if (p?.date) goToExpDay(p.date);
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                            <Line
                              type="monotone"
                              dataKey="amount"
                              name="Expenses"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              dot={{ r: 2, cursor: "pointer" }}
                              activeDot={{ r: 4, cursor: "pointer" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground/70 mt-2">Click a point to view that day's expenses.</p>
                  </div>

                  {/* By category — chart + table, same clickable-row pattern as every other
                      breakdown on this dashboard. */}
                  <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                    <p className="text-sm font-semibold text-foreground mb-3">Expenses by Category</p>
                    {expCategoryChartData.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-8 text-center">No expenses recorded this period.</p>
                    ) : (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={expCategoryChartData}
                            barCategoryGap="24%"
                            margin={{ top: 20 }}
                            onClick={(state) => {
                              const p = state?.activePayload?.[0]?.payload as { name: string } | undefined;
                              if (p?.name) goToExpCategory(p.name);
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Bar dataKey="amount" name="Amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} cursor="pointer">
                              <LabelList dataKey="amount" position="top" formatter={(v: number) => money(v)} style={{ fontSize: 10, fill: "hsl(var(--foreground))" }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-border/40">
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Transactions</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">% of Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(exp.byCategory ?? []).map((c) => (
                          <TableRow
                            key={c.name}
                            className={cn("border-border/40", c.amount > 0 && "cursor-pointer hover:bg-muted/30 transition-colors")}
                            onClick={() => c.amount > 0 && goToExpCategory(c.name)}
                          >
                            <TableCell className={cn("font-medium", c.amount === 0 && "text-muted-foreground/60")}>
                              {c.name}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{money(c.amount)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {exp.totalAmount > 0 ? `${Math.round((c.amount / exp.totalAmount) * 100)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-border/40 bg-muted/30 font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right tabular-nums">{exp.totalCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(exp.totalAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">100%</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Waste / Food Loss Trends (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Waste / Food Loss Trends"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !wasteSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setWasteSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                    Waste / Food Loss Trends
                  </h2>
                  {wasteSectionCollapsed && waste && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-destructive/10 text-destructive border-destructive/20">
                      {money(waste.totalAmount)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWasteSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={wasteSectionCollapsed ? "Expand Waste / Food Loss Trends" : "Collapse Waste / Food Loss Trends"}
                  aria-label={wasteSectionCollapsed ? "Expand Waste / Food Loss Trends" : "Collapse Waste / Food Loss Trends"}
                >
                  <span className="text-xs font-medium hidden sm:inline">{wasteSectionCollapsed ? "Show" : "Hide"}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      wasteSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!wasteSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setWasteRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        wastePreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={wasteFromStr}
                      onChange={(val) => { setWasteFromStr(val); setWastePreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={wasteToStr}
                      onChange={(val) => { setWasteToStr(val); setWastePreset("Custom"); }}
                      min={wasteFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground/70">No time-of-day filter — waste isn't hourly.</span>
              </div>
            )}
          </div>

          {!wasteSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {wasteLoading || !waste ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
                  </div>
                  <Skeleton className="h-48 rounded-xl" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Headline tiles */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-destructive/[0.04] border border-destructive/25 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Food Loss</p>
                      <p className="text-xl font-bold tracking-tight text-destructive mt-0.5">{money(waste.totalAmount)}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Incidents</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{waste.totalCount}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg / Day</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{money(waste.avgPerDay)}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top Reason</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5 truncate">
                        {wasteReasonChartData[0]?.name ?? "—"}
                      </p>
                      {wasteReasonChartData[0] && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{money(wasteReasonChartData[0].amount)}</p>
                      )}
                    </div>
                  </div>

                  {/* Trend over time */}
                  <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                    <p className="text-sm font-semibold text-foreground mb-3">Daily Trend</p>
                    {wasteTrendChartData.every((t) => t.amount === 0) ? (
                      <p className="text-xs text-muted-foreground py-8 text-center">No waste recorded this period.</p>
                    ) : (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={wasteTrendChartData}
                            margin={{ top: 10, right: 10 }}
                            onClick={(state) => {
                              const p = state?.activePayload?.[0]?.payload as { date: string } | undefined;
                              if (p?.date) goToWasteDay(p.date);
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                            <Line
                              type="monotone"
                              dataKey="amount"
                              name="Food Loss"
                              stroke="hsl(var(--destructive))"
                              strokeWidth={2}
                              dot={{ r: 2, cursor: "pointer" }}
                              activeDot={{ r: 4, cursor: "pointer" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground/70 mt-2">Click a point to view that day's waste records.</p>
                  </div>

                  {/* By reason — chart + table */}
                  <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                    <p className="text-sm font-semibold text-foreground mb-3">Food Loss by Reason</p>
                    {wasteReasonChartData.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-8 text-center">No waste recorded this period.</p>
                    ) : (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={wasteReasonChartData}
                            barCategoryGap="24%"
                            margin={{ top: 20 }}
                            onClick={(state) => {
                              const p = state?.activePayload?.[0]?.payload as { name: string } | undefined;
                              if (p?.name) goToWasteReason(p.name);
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Bar dataKey="amount" name="Amount" fill="hsl(var(--destructive) / 0.6)" radius={[4, 4, 0, 0]} maxBarSize={48} cursor="pointer">
                              <LabelList dataKey="amount" position="top" formatter={(v: number) => money(v)} style={{ fontSize: 10, fill: "hsl(var(--foreground))" }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-border/40">
                          <TableHead>Reason</TableHead>
                          <TableHead className="text-right">Incidents</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">% of Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(waste.byReason ?? []).map((r) => (
                          <TableRow
                            key={r.name}
                            className={cn("border-border/40", r.amount > 0 && "cursor-pointer hover:bg-muted/30 transition-colors")}
                            onClick={() => r.amount > 0 && goToWasteReason(r.name)}
                          >
                            <TableCell className={cn("font-medium", r.amount === 0 && "text-muted-foreground/60")}>
                              {r.name}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-destructive">{money(r.amount)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {waste.totalAmount > 0 ? `${Math.round((r.amount / waste.totalAmount) * 100)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-border/40 bg-muted/30 font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right tabular-nums">{waste.totalCount}</TableCell>
                          <TableCell className="text-right tabular-nums text-destructive">{money(waste.totalAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">100%</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Deals Performance (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Deals Performance"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !dpSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setDpSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <Tag className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                    Deals Performance
                  </h2>
                  {dpSectionCollapsed && dp && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
                      {dp.totalRedemptions} redemptions
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDpSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={dpSectionCollapsed ? "Expand Deals Performance" : "Collapse Deals Performance"}
                  aria-label={dpSectionCollapsed ? "Expand Deals Performance" : "Collapse Deals Performance"}
                >
                  <span className="text-xs font-medium hidden sm:inline">{dpSectionCollapsed ? "Show" : "Hide"}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      dpSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!dpSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDpRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        dpPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={dpFromStr}
                      onChange={(val) => { setDpFromStr(val); setDpPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={dpToStr}
                      onChange={(val) => { setDpToStr(val); setDpPreset("Custom"); }}
                      min={dpFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground/70">No time-of-day filter — deal usage isn't hourly.</span>
              </div>
            )}
          </div>

          {!dpSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {dpLoading || !dp ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
                  </div>
                  <Skeleton className="h-48 rounded-xl" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Headline tiles */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Redemptions</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{dp.totalRedemptions.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Deal Revenue</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{money(dp.totalRevenue)}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Most Used Deal</p>
                      <p className="text-base font-bold tracking-tight text-foreground mt-0.5 truncate">{dp.mostUsed?.name ?? "—"}</p>
                      {dp.mostUsed && <p className="text-[11px] text-muted-foreground mt-0.5">{dp.mostUsed.redemptions} redemptions</p>}
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Deals</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{dp.activeDealsCount}</p>
                    </div>
                  </div>

                  {dp.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No deals used this period.</p>
                  ) : (
                    <>
                      {/* Revenue by Deal */}
                      <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                        <p className="text-sm font-semibold text-foreground mb-3">Revenue by Deal</p>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dpChartData} barCategoryGap="24%" margin={{ top: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                              <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48}>
                                <LabelList dataKey="revenue" position="top" formatter={(v: number) => money(v)} style={{ fontSize: 10, fill: "hsl(var(--foreground))" }} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Per-deal table */}
                      <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Deal</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-right">Redemptions</TableHead>
                              <TableHead className="text-right">Revenue</TableHead>
                              <TableHead className="text-right">Discount</TableHead>
                              <TableHead className="text-right">Cost</TableHead>
                              <TableHead className="text-right">Profit</TableHead>
                              <TableHead className="text-right">Margin</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dp.rows.map((r) => (
                              <TableRow
                                key={r.dealId}
                                className="cursor-pointer hover:bg-muted/30 transition-colors"
                                onClick={() => goToDealSales(r.dealId, r.name)}
                                title="View Details on Sales & Orders"
                              >
                                <TableCell className="font-medium">{r.name}</TableCell>
                                <TableCell><Badge variant="outline" className="font-normal text-[11px]">{dealTypeLabel(r.type)}</Badge></TableCell>
                                <TableCell className="text-right tabular-nums">{r.redemptions}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium">{money(r.revenue)}</TableCell>
                                <TableCell className="text-right tabular-nums text-destructive">{r.discount > 0 ? `− ${money(r.discount)}` : "—"}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{r.cost !== null ? money(r.cost) : "—"}</TableCell>
                                <TableCell className={cn(
                                  "text-right tabular-nums",
                                  r.profit === null ? "text-muted-foreground" : r.profit >= 0 ? "text-emerald-500" : "text-destructive"
                                )}>
                                  {r.profit !== null ? money(r.profit) : "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{r.marginPct !== null ? `${r.marginPct}%` : "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Caveat — mirrors Net Profit's Purchases-context footer */}
                      {dp.rows.some((r) => ORDER_LEVEL_DEAL_TYPES.has(r.type)) && (
                        <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            <span className="font-semibold text-foreground">Promo Code / Minimum Spend</span> rows have no Cost/Profit/Margin — the discount
                            isn't tied to specific menu items. Discount is recomputed from the deal's current settings against each order's subtotal, so it
                            can shift slightly if the deal's percentage/amount was edited after some of these orders were placed.
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Sales by Staff (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Sales by Staff"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !staffSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setStaffSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <UserCheck className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Sales by Staff
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStaffSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={staffSectionCollapsed ? "Expand Sales by Staff" : "Collapse Sales by Staff"}
                  aria-label={staffSectionCollapsed ? "Expand Sales by Staff" : "Collapse Sales by Staff"}
                >
                  <span className="text-xs font-medium hidden sm:inline">
                    {staffSectionCollapsed ? "Show" : "Hide"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      staffSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!staffSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setStaffRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        staffPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={staffFromStr}
                      onChange={(val) => { setStaffFromStr(val); setStaffPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={staffToStr}
                      onChange={(val) => { setStaffToStr(val); setStaffPreset("Custom"); }}
                      min={staffFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="inline-flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 px-2.5 text-xs font-medium gap-1.5 border shadow-sm transition-all",
                          staffTimeFrom || staffTimeTo
                            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                            : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Clock className={cn("h-3.5 w-3.5 shrink-0", (staffTimeFrom || staffTimeTo) && "text-primary")} />
                        <span>
                          {staffTimeFrom || staffTimeTo
                            ? `${staffTimeFrom ? formatTimeLabel(staffTimeFrom) : "12:00 AM"} – ${staffTimeTo ? formatTimeLabel(staffTimeTo) : "11:59 PM"}`
                            : "All Day (Time)"}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3 space-y-3" align="start">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span>Filter By Shift Hours</span>
                        </div>
                        {(staffTimeFrom || staffTimeTo) && (
                          <button
                            type="button"
                            onClick={() => { setStaffTimeFrom(""); setStaffTimeTo(""); }}
                            className="text-[11px] text-destructive hover:underline font-medium"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground">Quick Shift Presets</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: "Lunch Shift", from: "11:00", to: "17:00" },
                            { label: "Dinner Peak", from: "17:00", to: "23:59" },
                            { label: "Late Night", from: "23:00", to: "04:00" },
                            { label: "Full Operating Day", from: "11:00", to: "23:59" },
                          ].map((shift) => (
                            <Button
                              key={shift.label}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => { setStaffTimeFrom(shift.from); setStaffTimeTo(shift.to); }}
                              className={cn(
                                "h-7 text-[11px] justify-start px-2 font-normal border-border/60",
                                staffTimeFrom === shift.from && staffTimeTo === shift.to
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted"
                              )}
                            >
                              {shift.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <p className="text-[11px] font-medium text-muted-foreground">Custom Time Range</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Start Time</label>
                            <TimePicker
                              value={staffTimeFrom || "11:00"}
                              onChange={setStaffTimeFrom}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">End Time</label>
                            <TimePicker
                              value={staffTimeTo || "23:59"}
                              onChange={setStaffTimeTo}
                              className="h-8 text-xs bg-background"
                            />
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {(staffTimeFrom || staffTimeTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setStaffTimeFrom(""); setStaffTimeTo(""); }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                      title="Clear time filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {!staffSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {staffLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : (staffData?.rows ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No sales in this period.</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto -mx-1 px-1">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Staff</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Sale</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(staffData?.rows ?? []).map((r) => (
                          <TableRow
                            key={r.staffId ?? r.name}
                            className={cn(
                              "transition-colors group/row",
                              r.staffId ? "cursor-pointer hover:bg-primary/5" : "opacity-70"
                            )}
                            onClick={() => goToStaffSales(r.staffId, r.name)}
                            title={r.staffId ? "View Details on Sales & Orders" : "No staff id on these orders — can't drill down"}
                          >
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell><Badge variant="outline" className="font-normal text-[11px]">{r.source}</Badge></TableCell>
                            <TableCell className="text-right text-muted-foreground">{r.orders}</TableCell>
                            <TableCell className="text-right font-medium">{currency} {r.sale.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{currency} {r.cost.toLocaleString()}</TableCell>
                            <TableCell className={cn("text-right font-medium", r.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {currency} {r.profit.toLocaleString()}
                            </TableCell>
                            <TableCell className={cn("text-right", r.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {r.marginPct}%
                            </TableCell>
                            <TableCell className="w-8">
                              {r.staffId && <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover/row:text-primary group-hover/row:translate-x-0.5" />}
                            </TableCell>
                          </TableRow>
                        ))}
                        {staffData?.combined && (
                          <TableRow className="border-t-2 border-emerald-500/30 bg-emerald-500/[0.04] font-semibold">
                            <TableCell className="font-bold" colSpan={2}>Total</TableCell>
                            <TableCell className="text-right">{staffData.combined.orders}</TableCell>
                            <TableCell className="text-right">{currency} {staffData.combined.sale.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{currency} {staffData.combined.cost.toLocaleString()}</TableCell>
                            <TableCell className={cn("text-right", staffData.combined.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {currency} {staffData.combined.profit.toLocaleString()}
                            </TableCell>
                            <TableCell className={cn("text-right", staffData.combined.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {staffData.combined.marginPct}%
                            </TableCell>
                            <TableCell className="w-8" />
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Charts: top 8 staff by sale. Sale/Cost use this app's one validated
                      categorical pair (--primary / --info); Profit is colored by sign (a status
                      signal, not identity) and reinforced with direct value labels + a legend
                      key — same treatment as every other "Sales by X" section's Profit chart. */}
                  {staffChartData.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <p className="text-sm font-semibold text-foreground mb-3">Sale vs Cost by Staff</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={staffChartData} barGap={4} barCategoryGap="24%">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                              dataKey="sale" name="Sale" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36}
                              cursor="pointer"
                              onClick={(data: any) => goToStaffSales(data?.staffId ?? null, data?.name)}
                            />
                            <Bar
                              dataKey="cost" name="Cost" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} maxBarSize={36}
                              cursor="pointer"
                              onClick={(data: any) => goToStaffSales(data?.staffId ?? null, data?.name)}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-foreground">Profit by Staff</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Profit</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive" />Loss</span>
                        </div>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={staffChartData} barCategoryGap="30%" margin={{ top: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Bar
                              dataKey="profit" name="Profit" radius={[4, 4, 0, 0]} maxBarSize={44}
                              cursor="pointer"
                              onClick={(data: any) => goToStaffSales(data?.staffId ?? null, data?.name)}
                            >
                              {staffChartData.map((entry) => (
                                <Cell key={entry.name} fill={entry.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                              ))}
                              <LabelList
                                dataKey="profit"
                                position="top"
                                formatter={(v: number) => `${currency} ${v.toLocaleString()}`}
                                style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Sales by Outlet — Super Admin, chain-wide view only. A single-outlet scope always
          yields one row, which has no comparative value, so the section is hidden rather than
          shown half-useful. */}
      {branchSectionVisible && (
        <section
          aria-label="Sales by Outlet"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !branchSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setBranchSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <Building2 className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Sales by Outlet
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBranchSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={branchSectionCollapsed ? "Expand Sales by Outlet" : "Collapse Sales by Outlet"}
                  aria-label={branchSectionCollapsed ? "Expand Sales by Outlet" : "Collapse Sales by Outlet"}
                >
                  <span className="text-xs font-medium hidden sm:inline">
                    {branchSectionCollapsed ? "Show" : "Hide"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      branchSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!branchSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setBranchRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        branchPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={branchFromStr}
                      onChange={(val) => { setBranchFromStr(val); setBranchPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={branchToStr}
                      onChange={(val) => { setBranchToStr(val); setBranchPreset("Custom"); }}
                      min={branchFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground/70">Click a branch to view its own Dashboard.</span>
              </div>
            )}
          </div>

          {!branchSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {branchLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : (branchData?.rows ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No sales in this period.</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto -mx-1 px-1">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead>Outlet</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Sale</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Profit</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(branchData?.rows ?? []).map((r) => (
                          <TableRow
                            key={r.outletId ?? r.name}
                            className={cn(
                              "transition-colors group/row",
                              r.outletId ? "cursor-pointer hover:bg-primary/5" : "opacity-70"
                            )}
                            onClick={() => goToBranch(r.outletId)}
                            title={r.outletId ? "View this branch's Dashboard" : "No outlet on these orders — can't drill down"}
                          >
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{r.orders}</TableCell>
                            <TableCell className="text-right font-medium">{currency} {r.sale.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{currency} {r.cost.toLocaleString()}</TableCell>
                            <TableCell className={cn("text-right font-medium", r.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {currency} {r.profit.toLocaleString()}
                            </TableCell>
                            <TableCell className={cn("text-right", r.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {r.marginPct}%
                            </TableCell>
                            <TableCell className="w-8">
                              {r.outletId && <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover/row:text-primary group-hover/row:translate-x-0.5" />}
                            </TableCell>
                          </TableRow>
                        ))}
                        {branchData?.combined && (
                          <TableRow className="border-t-2 border-emerald-500/30 bg-emerald-500/[0.04] font-semibold">
                            <TableCell className="font-bold">Total</TableCell>
                            <TableCell className="text-right">{branchData.combined.orders}</TableCell>
                            <TableCell className="text-right">{currency} {branchData.combined.sale.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{currency} {branchData.combined.cost.toLocaleString()}</TableCell>
                            <TableCell className={cn("text-right", branchData.combined.profit >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {currency} {branchData.combined.profit.toLocaleString()}
                            </TableCell>
                            <TableCell className={cn("text-right", branchData.combined.marginPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {branchData.combined.marginPct}%
                            </TableCell>
                            <TableCell className="w-8" />
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {branchChartData.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <p className="text-sm font-semibold text-foreground mb-3">Sale vs Cost by Outlet</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={branchChartData} barGap={4} barCategoryGap="24%">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                              dataKey="sale" name="Sale" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36}
                              cursor="pointer"
                              onClick={(data: any) => goToBranch(data?.outletId ?? null)}
                            />
                            <Bar
                              dataKey="cost" name="Cost" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} maxBarSize={36}
                              cursor="pointer"
                              onClick={(data: any) => goToBranch(data?.outletId ?? null)}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-foreground">Profit by Outlet</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Profit</span>
                          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive" />Loss</span>
                        </div>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={branchChartData} barCategoryGap="30%" margin={{ top: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                            <Bar
                              dataKey="profit" name="Profit" radius={[4, 4, 0, 0]} maxBarSize={44}
                              cursor="pointer"
                              onClick={(data: any) => goToBranch(data?.outletId ?? null)}
                            >
                              {branchChartData.map((entry) => (
                                <Cell key={entry.name} fill={entry.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                              ))}
                              <LabelList
                                dataKey="profit"
                                position="top"
                                formatter={(v: number) => `${currency} ${v.toLocaleString()}`}
                                style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Cancellation Requests (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Cancellation Requests"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !crSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setCrSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <Ban className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                    Cancellation Requests
                  </h2>
                  {crSectionCollapsed && crData && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
                      {crData.totalRequests} requests
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCrSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={crSectionCollapsed ? "Expand Cancellation Requests" : "Collapse Cancellation Requests"}
                  aria-label={crSectionCollapsed ? "Expand Cancellation Requests" : "Collapse Cancellation Requests"}
                >
                  <span className="text-xs font-medium hidden sm:inline">{crSectionCollapsed ? "Show" : "Hide"}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      crSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!crSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCrRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        crPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={crFromStr}
                      onChange={(val) => { setCrFromStr(val); setCrPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={crToStr}
                      onChange={(val) => { setCrToStr(val); setCrPreset("Custom"); }}
                      min={crFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground/70">No time-of-day filter — cancellations aren't hourly.</span>
              </div>
            )}
          </div>

          {!crSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {crLoading || !crData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
                  </div>
                  <Skeleton className="h-48 rounded-xl" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Headline tiles — each drills into Cancellation Requests filtered to this
                      section's date window + the matching status. */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div
                      className="rounded-lg bg-background/70 border border-border/50 p-3.5 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                      onClick={() => goToCancellations({ status: "all" })}
                      title="View all requests this period"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Requests</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{crData.totalRequests.toLocaleString()}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{crData.rejected} rejected</p>
                    </div>
                    <div
                      className="rounded-lg bg-background/70 border border-border/50 p-3.5 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                      onClick={() => goToCancellations({ status: "approved" })}
                      title="View approved requests this period"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Approved</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{crData.approved.toLocaleString()}</p>
                    </div>
                    <div
                      className="rounded-lg bg-background/70 border border-border/50 p-3.5 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                      onClick={() => goToCancellations({ status: "pending" })}
                      title="View pending requests this period"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pending Review</p>
                      <p className={cn("text-xl font-bold tracking-tight mt-0.5", crData.pending > 0 ? "text-warning" : "text-foreground")}>
                        {crData.pending.toLocaleString()}
                      </p>
                    </div>
                    <div
                      className="rounded-lg bg-background/70 border border-border/50 p-3.5 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                      onClick={() => goToCancellations({ status: "approved" })}
                      title="View approved (refunded) requests this period"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Refunded</p>
                      <p className="text-xl font-bold tracking-tight text-destructive mt-0.5">{money(crData.totalRefunded)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">+{money(crData.totalPenalties)} in penalties</p>
                    </div>
                  </div>

                  {crData.approved === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No approved cancellations this period.</p>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                        <p className="text-sm font-semibold text-foreground mb-3">Cancellations by Reason</p>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={crReasonChartData} barCategoryGap="30%" margin={{ top: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                              <Bar
                                dataKey="count" name="Count" fill="hsl(var(--destructive) / 0.7)" radius={[4, 4, 0, 0]} maxBarSize={44}
                                cursor="pointer"
                                onClick={(data: any) => goToCancellations({ status: "approved", reason: data?.name })}
                              >
                                <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "hsl(var(--foreground))" }} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
                        <div className="px-4 py-2.5 bg-muted/40 border-b border-border/40">
                          <p className="text-sm font-semibold text-foreground">Most Responsible Staff</p>
                        </div>
                        <div className="divide-y divide-border/40 text-sm">
                          {crData.byStaff.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-muted-foreground">No staff member marked responsible this period.</p>
                          ) : (
                            crData.byStaff.map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors group/row"
                                onClick={() => goToCancellations({ status: "approved", responsibleUserId: s.id, responsibleName: s.name })}
                              >
                                <span className="text-muted-foreground truncate inline-flex items-center gap-1">
                                  {s.name}
                                  <ChevronRight className="h-3 w-3 text-muted-foreground/40 transition-transform group-hover/row:translate-x-0.5" />
                                </span>
                                <span className="flex items-center gap-2">
                                  <span className="text-[11px] text-muted-foreground">{s.count} incident{s.count === 1 ? "" : "s"}</span>
                                  <span className="tabular-nums font-medium text-destructive">{money(s.penalty)}</span>
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Purchases & Supplier Spend (same "reports" permission gate) */}
      {salesByChannelVisible && (
        <section
          aria-label="Purchases & Supplier Spend"
          className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md shadow-sm overflow-hidden transition-all"
        >
          <div className={cn("p-4 sm:p-5 space-y-4 bg-card/70", !pSectionCollapsed && "border-b border-border/50")}>
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer select-none group"
                onClick={() => setPSectionCollapsed((prev) => !prev)}
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 shadow-sm group-hover:bg-primary/20 transition-colors">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors whitespace-nowrap">
                  Purchases & Supplier Spend
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPSectionCollapsed((prev) => !prev)}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 gap-1.5 rounded-lg border border-border/50"
                  title={pSectionCollapsed ? "Expand Purchases & Supplier Spend" : "Collapse Purchases & Supplier Spend"}
                  aria-label={pSectionCollapsed ? "Expand Purchases & Supplier Spend" : "Collapse Purchases & Supplier Spend"}
                >
                  <span className="text-xs font-medium hidden sm:inline">{pSectionCollapsed ? "Show" : "Hide"}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      pSectionCollapsed ? "-rotate-90" : "rotate-0"
                    )}
                  />
                </Button>
              </div>
            </div>

            {!pSectionCollapsed && (
              <div className="flex items-center gap-2.5 flex-wrap pt-3 border-t border-border/40">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
                  {(["Today", "This Week", "This Month"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPRange(p)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                        pPreset === p
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <div className="w-36">
                    <DatePicker
                      value={pFromStr}
                      onChange={(val) => { setPFromStr(val); setPPreset("Custom"); }}
                      placeholder="Start date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
                  <div className="w-36">
                    <DatePicker
                      value={pToStr}
                      onChange={(val) => { setPToStr(val); setPPreset("Custom"); }}
                      min={pFromStr}
                      placeholder="End date"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <span className="text-[11px] text-muted-foreground/70">No time-of-day filter — purchases aren't hourly.</span>
              </div>
            )}
          </div>

          {!pSectionCollapsed && (
            <div className="p-4 sm:p-5">
              {pLoading || !pData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
                  </div>
                  <Skeleton className="h-48 rounded-xl" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Headline tiles */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div
                      className="rounded-lg bg-background/70 border border-border/50 p-3.5 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                      onClick={() => goToPurchases()}
                      title="View all purchases this period"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Purchases</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{money(pData.totalAmount)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{pData.purchaseCount} purchase{pData.purchaseCount === 1 ? "" : "s"}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Paid</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{money(pData.totalPaid)}</p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Due</p>
                      <p className={cn("text-xl font-bold tracking-tight mt-0.5", pData.totalDue > 0 ? "text-destructive" : "text-foreground")}>
                        {money(pData.totalDue)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-background/70 border border-border/50 p-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Suppliers</p>
                      <p className="text-xl font-bold tracking-tight text-foreground mt-0.5">{pData.supplierCount.toLocaleString()}</p>
                    </div>
                  </div>

                  {pData.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No purchases this period.</p>
                  ) : (
                    <>
                      <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                        <p className="text-sm font-semibold text-foreground mb-3">Spend by Supplier</p>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={pChartData} barGap={4} barCategoryGap="24%">
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={0} angle={-20} textAnchor="end" height={54} />
                              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${currency}${(v / 1000).toFixed(0)}k`} />
                              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Bar
                                dataKey="paid" name="Paid" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36}
                                cursor="pointer"
                                onClick={(data: any) => goToPurchases(data?.id ?? null)}
                              />
                              <Bar
                                dataKey="due" name="Due" fill="hsl(var(--destructive) / 0.7)" radius={[4, 4, 0, 0]} maxBarSize={36}
                                cursor="pointer"
                                onClick={(data: any) => goToPurchases(data?.id ?? null)}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="overflow-x-auto -mx-1 px-1">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                              <TableHead>Supplier</TableHead>
                              <TableHead className="text-right">Purchases</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-right">Paid</TableHead>
                              <TableHead className="text-right">Due</TableHead>
                              <TableHead className="w-8" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pData.rows.map((r) => (
                              <TableRow
                                key={r.id || r.name}
                                className={cn(
                                  "transition-colors group/row",
                                  r.id ? "cursor-pointer hover:bg-primary/5" : "opacity-70"
                                )}
                                onClick={() => goToPurchases(r.id || null)}
                                title={r.id ? "View this supplier's purchases" : "No supplier on these purchases — can't drill down"}
                              >
                                <TableCell className="font-medium">{r.name}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{r.count}</TableCell>
                                <TableCell className="text-right font-medium">{money(r.total)}</TableCell>
                                <TableCell className="text-right">{money(r.paid)}</TableCell>
                                <TableCell className={cn("text-right", r.due > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
                                  {money(r.due)}
                                </TableCell>
                                <TableCell className="w-8">
                                  {r.id && <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover/row:text-primary group-hover/row:translate-x-0.5" />}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="border-t-2 border-emerald-500/30 bg-emerald-500/[0.04] font-semibold">
                              <TableCell className="font-bold">Total</TableCell>
                              <TableCell className="text-right">{pData.purchaseCount}</TableCell>
                              <TableCell className="text-right">{money(pData.totalAmount)}</TableCell>
                              <TableCell className="text-right">{money(pData.totalPaid)}</TableCell>
                              <TableCell className={cn("text-right", pData.totalDue > 0 ? "text-destructive" : "")}>{money(pData.totalDue)}</TableCell>
                              <TableCell className="w-8" />
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Dough / Short-Life Batches */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Dough / Short-Life Batches
        </h3>
        <Card className="shadow-sm">
          <CardContent className="p-5">
            {doughBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active dough batches</p>
            ) : (
              <div>
                {doughBatches.map((b) => {
                  const m = liveMins(b.expiresAt);
                  const st = m <= 0 ? 'expired' : m <= 60 ? 'near-expiry' : 'active';
                  const colour = st === 'expired' ? 'text-destructive' : st === 'near-expiry' ? 'text-warning' : 'text-success';
                  return (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">{b.ingredientName}</p>
                        <p className="text-xs text-muted-foreground">{b.remainingQty} {b.unit ?? ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-semibold ${colour}`}>{st === 'expired' ? 'EXPIRED' : fmtLeft(m)}</span>
                        {st === 'expired' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">Waste</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Waste this batch?</AlertDialogTitle>
                                <AlertDialogDescription>{b.remainingQty} {b.unit ?? ''} of {b.ingredientName} will be removed from stock and recorded as waste.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => wasteBatch(b.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Waste</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Day-wise Sales (This Week) */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Day-wise Sales (This Week)
        </h3>
        <ClickableCard interactive={salesDrillEnabled} onClick={goToSales}>
          <CardContent className="p-5">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d?.daywiseSales ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                  <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </ClickableCard>
      </div>

      {/* Growth vs Last Month */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Growth vs Last Month
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Online Growth", value: d?.month.growthOnlinePct ?? 0 },
            { label: "Offline Growth", value: d?.month.growthOfflinePct ?? 0 },
            { label: "Overall Growth", value: d?.month.overallGrowthPct ?? 0 },
          ].map(({ label, value }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{label}</p>
                    <p className={`text-2xl font-bold mt-1 ${value >= 0 ? "text-success" : "text-destructive"}`}>
                      {value >= 0 ? "+" : ""}{value}%
                    </p>
                  </div>
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${value >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                    {value >= 0
                      ? <ArrowUpCircle className="h-5 w-5 text-success" />
                      : <ArrowDownCircle className="h-5 w-5 text-destructive" />
                    }
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Customer Intelligence */}
      {customerIntelVisible && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Customer Intelligence
            </h3>
            {/* The zone itself is gated on hasPermission("reports"), so this link is always reachable here. */}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => navigate("/reports")}>
              View full reports <ChevronRight className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Unique Customers (This Week)</p>
                    <p className="text-2xl font-bold mt-1">{uniqueCustomersThisWeek}</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {tileVisible("top-customers") && (
            <Card className="shadow-sm mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top 10 Customers</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {(d?.topCustomers ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No customer history available yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Spent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(d?.topCustomers ?? []).map((c, idx) => (
                        <TableRow
                          key={c.customerId ?? `${c.name}-${idx}`}
                          className={cn(c.customerId && "cursor-pointer hover:bg-muted/30")}
                          onClick={c.customerId ? () => navigate(`/customers/${c.customerId}`) : undefined}
                        >
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right">{c.totalOrders}</TableCell>
                          <TableCell className="text-right">{currency} {c.totalSpent.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Peak Hours (This Week)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peakHoursChart}>
                      <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={1} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload as { orders: number; revenue: number };
                          return (
                            <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                              <p className="font-medium mb-1">{label}</p>
                              <p className="text-muted-foreground">{row.orders} orders</p>
                              <p className="text-muted-foreground">{currency} {row.revenue.toLocaleString()} revenue</p>
                            </div>
                          );
                        }}
                        cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }}
                      />
                      <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Customer Activity (This Week)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={customerActivityChart}>
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="newCustomers" stackId="c" name="New" fill="hsl(var(--primary))" />
                      <Bar dataKey="returningCustomers" stackId="c" name="Returning" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Order Type Trend (This Week)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={orderTypeTrendChart}>
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="offline" stackId="t" name="Offline" fill="hsl(var(--success))" />
                      <Bar dataKey="online" stackId="t" name="Online" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-base">Day-of-Week Performance (60 Days)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayPerformanceChart}>
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload as { orderCount: number; avgSales: number };
                          return (
                            <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
                              <p className="font-medium mb-1">{label}</p>
                              <p className="text-muted-foreground">Avg order: {currency} {row.avgSales.toLocaleString()}</p>
                              <p className="text-muted-foreground">{row.orderCount} orders</p>
                            </div>
                          );
                        }}
                        cursor={{ fill: "hsl(var(--muted) / 0.15)", radius: 4 }}
                      />
                      <Bar dataKey="avgSales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Today's Operations */}
      {zoneVisible("operations") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Today's Operations
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("live-orders")} interactive onClick={() => goToTile("live-orders")}
              icon={BarChart3} title="Live Orders"
              value={(d?.today.liveStatus.pending ?? 0) + (d?.today.liveStatus.preparing ?? 0) + (d?.today.liveStatus.ready ?? 0)}
              sub={`Pending ${d?.today.liveStatus.pending ?? 0} · Preparing ${d?.today.liveStatus.preparing ?? 0} · Ready ${d?.today.liveStatus.ready ?? 0}`}
            />
            <StatTile
              visible={tileVisible("kitchens-preparing")} interactive onClick={() => goToTile("kitchens-preparing")}
              icon={ChefHat} title="Kitchens"
              value={d?.today.liveStatus.preparing ?? 0}
              sub="Orders in preparation"
            />
            <StatTile
              visible={tileVisible("tables")} interactive onClick={() => goToTile("tables")}
              icon={LayoutGrid} title="Tables"
              value={d?.tables.occupied ?? 0}
              sub={`${d?.tables.available ?? 0} available`}
            />
            <StatTile
              visible={tileVisible("cancellation-requests")} interactive onClick={() => goToTile("cancellation-requests")}
              icon={Ban} title="Cancellation Requests"
              value={d?.pendingCancellations ?? 0}
              valueClassName={(d?.pendingCancellations ?? 0) > 0 ? "text-warning" : undefined}
              sub="Awaiting approval"
            />
          </div>
        </div>
      )}

      {/* Inventory & Procurement */}
      {zoneVisible("inventory") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Package className="h-4 w-4" />
            Inventory & Procurement
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("low-stock")} interactive onClick={() => goToTile("low-stock")}
              icon={Package} title="Low Stock Alert"
              value={d?.lowStockCount ?? 0}
              valueClassName={(d?.lowStockCount ?? 0) > 0 ? "text-destructive" : undefined}
              sub="At or below threshold"
            />
            <StatTile
              visible={tileVisible("pending-purchase-requests")} interactive onClick={() => goToTile("pending-purchase-requests")}
              icon={ClipboardList} title="Pending Purchase Requests"
              value={d?.pendingPurchaseRequests ?? 0}
              valueClassName={(d?.pendingPurchaseRequests ?? 0) > 0 ? "text-warning" : undefined}
            />
            <StatTile
              visible={tileVisible("pending-demands")} interactive onClick={() => goToTile("pending-demands")}
              icon={ArrowLeftRight} title="Pending Demands"
              value={d?.pendingDemands ?? 0}
              valueClassName={(d?.pendingDemands ?? 0) > 0 ? "text-warning" : undefined}
            />
          </div>
        </div>
      )}

      {/* People */}
      {zoneVisible("people") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            People
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("attendance-today")} interactive onClick={() => goToTile("attendance-today")}
              icon={UserCheck} title="Today's Attendance"
              value={d?.attendanceToday.present ?? 0}
              sub={`Late ${d?.attendanceToday.late ?? 0} · Absent ${d?.attendanceToday.absent ?? 0}`}
            />
            <StatTile
              visible={tileVisible("pending-leave")} interactive onClick={() => goToTile("pending-leave")}
              icon={CalendarOff} title="Pending Leave Requests"
              value={d?.pendingLeaveRequests ?? 0}
              valueClassName={(d?.pendingLeaveRequests ?? 0) > 0 ? "text-warning" : undefined}
            />
          </div>
        </div>
      )}

      {/* Delivery */}
      {zoneVisible("delivery") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Bike className="h-4 w-4" />
            Delivery
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("active-deliveries")} interactive onClick={() => goToTile("active-deliveries")}
              icon={Bike} title="Active Deliveries"
              value={d?.deliveryActive ?? 0}
            />
          </div>
        </div>
      )}

      {/* Reservations */}
      {zoneVisible("reservations") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" />
            Reservations
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("reservations-today")} interactive onClick={() => goToTile("reservations-today")}
              icon={CalendarCheck} title="Today's Reservations"
              value={d?.reservationsToday ?? 0}
            />
          </div>
        </div>
      )}

      {/* Cash Hub */}
      {zoneVisible("cashHub") && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Cash Hub
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              visible={tileVisible("unsettled-cash")} interactive onClick={() => goToTile("unsettled-cash")}
              icon={Coins} title="Unsettled Cash"
              value={`${currency} ${(d?.cashHub.totalUnsettled ?? 0).toLocaleString()}`}
              sub={`${d?.cashHub.staffCount ?? 0} staff`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
