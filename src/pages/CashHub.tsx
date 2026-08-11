import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Coins,
  Search,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  UserCheck,
  Banknote,
  CreditCard,
  Globe,
  FileText,
  RefreshCw,
  Check,
  X,
  Eye,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";

import {
  cashSettlementService,
  type ActiveStaffBalance,
  type CashSettlementRecord,
} from "@/services/cashSettlement.service";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { useModuleEvents } from "@/hooks/use-module-events";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { api } from "@/services/api";

import { useOrderEvents } from "@/hooks/use-order-events";
import { useDeliveryEvents } from "@/hooks/use-delivery-events";

const CashHub = () => {
  const { user } = useAuth();
  const { settings } = useData();
  const queryClient = useQueryClient();
  const currency = settings?.currency || "Rs.";

  const configuredMethods =
    settings?.paymentMethods && settings.paymentMethods.length > 0
      ? settings.paymentMethods
      : ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"];

  // Active Tab state
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");

  // Filter state for Live Balances
  const [liveSearchQuery, setLiveSearchQuery] = useState("");
  const [liveRoleFilter, setLiveRoleFilter] = useState<string>("all");

  // Filter state for Settlement History
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");

  // Modal / Dialog state
  const [selectedStaffForSettlement, setSelectedStaffForSettlement] = useState<ActiveStaffBalance | null>(null);
  const [actualByMethodInput, setActualByMethodInput] = useState<Record<string, string>>({});
  const [settlementNotes, setSettlementNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Orders inspection modal state
  const [selectedStaffForOrders, setSelectedStaffForOrders] = useState<ActiveStaffBalance | null>(null);

  // View history detail modal state
  const [viewHistoryRecord, setViewHistoryRecord] = useState<CashSettlementRecord | null>(null);

  // 1. Fetch Active Staff Balances
  const {
    data: activeBalances = [],
    isLoading: isLoadingActive,
    refetch: refetchActive,
  } = useQuery({
    queryKey: ["active-cash-balances"],
    queryFn: async () => {
      api.clearCache("/cash-settlements/active-balances");
      return cashSettlementService.getActiveBalances();
    },
  });

  const filteredActiveBalances = activeBalances.filter((item) => {
    const matchesSearch = item.staffName.toLowerCase().includes(liveSearchQuery.toLowerCase());
    const matchesRole =
      liveRoleFilter === "all" ||
      item.staffRole.toLowerCase().includes(liveRoleFilter.toLowerCase());
    return matchesSearch && matchesRole;
  });

  // 2. Fetch Settlement History
  const {
    data: historyRes,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ["cash-settlement-history", roleFilter, dateFilter],
    queryFn: async () => {
      api.clearCache("/cash-settlements/history");
      return cashSettlementService.getHistory({
        role: roleFilter !== "all" ? roleFilter : undefined,
        date: dateFilter || undefined,
      });
    },
  });

  const historyData: CashSettlementRecord[] = historyRes?.data || [];

  // Socket event & Polling refetch handler
  const refetchAll = () => {
    api.clearCache("/cash-settlements/active-balances");
    api.clearCache("/cash-settlements/history");
    refetchActive();
    refetchHistory();
    queryClient.invalidateQueries({ queryKey: ["active-cash-balances"] });
    queryClient.invalidateQueries({ queryKey: ["cash-settlement-history"] });
  };

  useModuleEvents(["cashSettlement:created", "order:created", "order:updated", "delivery:status_updated", "delivery:assigned"], refetchAll);
  useOrderEvents(refetchAll);
  useDeliveryEvents(refetchAll);
  useVisiblePolling(refetchAll, 30000);

  // Stats Calculations
  const totalUnclearedCash = activeBalances.reduce((sum, item) => sum + (item.totalExpected || 0), 0);
  const activeStaffCount = activeBalances.length;

  const todayStr = new Date().toDateString();
  const todayEntries = historyData.filter(
    (item) => new Date(item.createdAt).toDateString() === todayStr
  );

  const totalCashSettledToday = todayEntries.reduce((sum, item) => sum + (Number(item.totalActual) || 0), 0);
  const todayNetDifference = todayEntries.reduce((sum, item) => sum + (Number(item.cashDifference) || 0), 0);

  // Open Settlement Modal
  const handleOpenSettlement = (staff: ActiveStaffBalance) => {
    if (!staff.accountLinked) {
      toast.error(`${staff.staffName} has no linked login account — link one before settling their cash.`);
      return;
    }
    setSelectedStaffForSettlement(staff);
    const initialInputs: Record<string, string> = {};
    configuredMethods.forEach((m) => {
      const val =
        staff.byMethod?.[m] ??
        (m.toLowerCase() === "cash"
          ? staff.expectedCash
          : m.toLowerCase().includes("card")
          ? staff.expectedCard
          : 0);
      initialInputs[m] = String(val || 0);
    });
    setActualByMethodInput(initialInputs);
    setSettlementNotes("");
  };

  // Submit Settlement
  const handleSubmitSettlement = async () => {
    if (!selectedStaffForSettlement) return;

    const actualByMethodNum: Record<string, number> = {};
    configuredMethods.forEach((m) => {
      actualByMethodNum[m] = Number(actualByMethodInput[m]) || 0;
    });

    const actualCash = actualByMethodNum["Cash"] ?? selectedStaffForSettlement.expectedCash;
    const actualCard = actualByMethodNum["Credit Card"] ?? actualByMethodNum["Card"] ?? selectedStaffForSettlement.expectedCard;
    const actualOnline = Object.entries(actualByMethodNum)
      .filter(([k]) => k !== "Cash" && k !== "Credit Card" && k !== "Card")
      .reduce((sum, [, v]) => sum + v, 0);

    setIsSubmitting(true);
    try {
      await cashSettlementService.createSettlement({
        staffId: selectedStaffForSettlement.staffId,
        actualCash,
        actualCard,
        actualOnline,
        actualByMethod: actualByMethodNum,
        notes: settlementNotes.trim() || undefined,
      });

      toast.success(`Cash settlement approved for ${selectedStaffForSettlement.staffName}`);
      setSelectedStaffForSettlement(null);
      refetchAll();
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit cash settlement");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Live difference calculations for modal
  const modalTotalActual = Object.values(actualByMethodInput).reduce(
    (sum, val) => sum + (Number(val) || 0),
    0
  );
  const modalExpectedTotal = selectedStaffForSettlement?.totalExpected || 0;
  const modalDiff = modalTotalActual - modalExpectedTotal;

  // Filter History Data locally for search text
  const filteredHistory = historyData.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.staffName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.settlementNo.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6 p-3 sm:p-5 lg:p-8 pb-16 w-full max-w-[1920px] mx-auto">
      {/* Page Header */}
      <PageHeader
        icon={<Coins className="h-6 w-6 text-amber-500" />}
        title="Collections & Cash Hub"
        subtitle="Active staff collections & settlement approvals"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAll()}
            className="gap-2 rounded-xl border-border hover:bg-muted font-bold text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Data
          </Button>
        }
      />

      {/* 4 Summary Stats Cards — Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-5">
        <Card className="bg-card/90 border border-amber-500/20 border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 pt-4">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Uncleared Floor Collections
            </CardTitle>
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl sm:text-3xl font-black text-foreground font-mono">
              {currency} {totalUnclearedCash.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
              Sum across active floor staff
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/90 border border-blue-500/20 border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 pt-4">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Staff Holding Collections
            </CardTitle>
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <UserCheck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-foreground font-mono">{activeStaffCount}</span>
              <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30 px-2 py-0.5 font-bold">
                {activeStaffCount === 1 ? "1 Member" : `${activeStaffCount} Members`}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
              Staff members with collections
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/90 border border-emerald-500/20 border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 pt-4">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Total Settled Today
            </CardTitle>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-2xl sm:text-3xl font-black text-emerald-500 font-mono">
              {currency} {totalCashSettledToday.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
              Approved today's actual collections
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/90 border border-indigo-500/20 border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 pt-4">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Today Net Difference
            </CardTitle>
            <div className="h-8 w-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              {todayNetDifference >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-rose-500" />
              )}
            </div>
          </CardHeader>
          <CardContent className="pb-4 flex flex-col justify-between">
            <div className="text-2xl sm:text-3xl font-black font-mono text-foreground">
              {todayNetDifference > 0
                ? `+${currency} ${todayNetDifference.toLocaleString()}`
                : todayNetDifference < 0
                ? `-${currency} ${Math.abs(todayNetDifference).toLocaleString()}`
                : `${currency} 0`}
            </div>
            <div className="mt-1">
              {todayNetDifference < 0 ? (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] font-bold">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Shortage
                </Badge>
              ) : todayNetDifference > 0 ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                  <Check className="h-3 w-3 mr-1" /> Excess
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] font-bold">
                  Exact Match
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "active" | "history")}>
        <TabsList className="w-full sm:w-auto grid grid-cols-2 max-w-md h-11 bg-muted/60 p-1 border border-border/80 rounded-2xl">
          <TabsTrigger value="active" className="gap-2 font-bold text-xs h-9 rounded-xl transition-all data-[state=active]:bg-card data-[state=active]:text-amber-500 data-[state=active]:shadow-sm">
            <Coins className="h-4 w-4" />
            Live Balances
            {activeStaffCount > 0 && (
              <Badge className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 text-black font-extrabold rounded-full border-none">
                {activeStaffCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 font-bold text-xs h-9 rounded-xl transition-all data-[state=active]:bg-card data-[state=active]:text-amber-500 data-[state=active]:shadow-sm">
            <FileText className="h-4 w-4" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Live Balances */}
        <TabsContent value="active" className="space-y-4 mt-4">
          {/* Controls Bar for Live Balances */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card/90 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl border border-border/80 shadow-sm">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search staff name..."
                  value={liveSearchQuery}
                  onChange={(e) => setLiveSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl bg-background"
                />
              </div>

              <Select value={liveRoleFilter} onValueChange={setLiveRoleFilter}>
                <SelectTrigger className="w-full sm:w-[160px] h-9 text-xs rounded-xl bg-background font-semibold">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="cashier">Cashiers</SelectItem>
                  <SelectItem value="waiter">Waiters</SelectItem>
                  <SelectItem value="rider">Delivery Riders</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-3 text-xs text-muted-foreground font-medium pt-1 md:pt-0 border-t md:border-t-0 border-border/40">
              <span>Showing <strong>{filteredActiveBalances.length}</strong> of <strong>{activeBalances.length}</strong> staff balances</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchAll()}
                className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
                title="Refresh Live Balances"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {isLoadingActive ? (
            <Card className="p-6 border-border">
              <div className="space-y-3">
                {[1, 2, 3, 4].map((n) => (
                  <Skeleton key={n} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            </Card>
          ) : filteredActiveBalances.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <CardContent className="space-y-3 pt-6">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                <h3 className="text-lg font-bold text-foreground">
                  {activeBalances.length === 0 ? "All Clear!" : "No Matching Staff Found"}
                </h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {activeBalances.length === 0
                    ? "No uncleared collections on the floor. All staff sales are currently settled."
                    : "No staff member matches your search or role filter criteria."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile View (< 768px): Touch-Optimized Cards */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredActiveBalances.map((item) => {
                  const oldestAgeHours = item.oldestOrderAt
                    ? (Date.now() - new Date(item.oldestOrderAt).getTime()) / 3_600_000
                    : 0;
                  const isStale = oldestAgeHours >= 24;

                  return (
                    <Card key={item.staffId} className="p-4 space-y-3 border-border bg-card shadow-sm">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-black text-sm shrink-0">
                            {item.staffName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-foreground">{item.staffName}</span>
                              <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                {item.staffRole}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {!item.accountLinked ? (
                                <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                                  No login linked
                                </Badge>
                              ) : (
                                <span className="text-[11px] text-muted-foreground font-medium">Linked Account</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <Badge variant="secondary" className="font-bold text-xs px-2.5 py-1">
                          {item.orderCount} {item.orderCount === 1 ? "Order" : "Orders"}
                        </Badge>
                      </div>

                      {/* Payment Breakdown Pills */}
                      <div className="grid grid-cols-2 gap-1.5 py-1">
                        {configuredMethods.map((m) => {
                          const amt =
                            item.byMethod?.[m] ??
                            (m.toLowerCase() === "cash"
                              ? item.expectedCash
                              : m.toLowerCase().includes("card")
                              ? item.expectedCard
                              : 0);
                          return (
                            <div key={m} className="bg-muted/40 p-2 rounded-xl border border-border/50 flex justify-between items-center text-xs">
                              <span className="text-[11px] text-muted-foreground font-medium truncate">{m}:</span>
                              <span className="font-mono font-bold text-foreground">
                                {amt > 0 ? `${currency} ${amt.toLocaleString()}` : "-"}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Total & Holding Time */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <div>
                          <span className="text-[11px] text-muted-foreground block font-medium uppercase tracking-wider">Total Expected</span>
                          <span className="text-lg font-black text-amber-500 font-mono">
                            {currency} {item.totalExpected.toLocaleString()}
                          </span>
                        </div>

                        <div>
                          {isStale ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold">
                              <Clock className="h-3 w-3 mr-1" />
                              {Math.floor(oldestAgeHours / 24)}+ day{Math.floor(oldestAgeHours / 24) === 1 ? "" : "s"}
                            </Badge>
                          ) : oldestAgeHours > 0 ? (
                            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground/60" />
                              {Math.max(1, Math.floor(oldestAgeHours))}h ago
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedStaffForOrders(item)}
                          className="w-full text-xs font-semibold gap-1.5 rounded-xl h-9"
                        >
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          Orders
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleOpenSettlement(item)}
                          disabled={!item.accountLinked}
                          className="w-full text-xs font-extrabold gap-1.5 rounded-xl bg-amber-500 text-black hover:bg-amber-600 shadow-sm h-9"
                        >
                          <Coins className="h-3.5 w-3.5" />
                          Settle
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Desktop / Widescreen View (>= 768px): Data Table */}
              <div className="hidden md:block border border-border/80 bg-card/90 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="hover:bg-transparent border-b border-border/60">
                        <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5">Staff Member</TableHead>
                        <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5 text-center">Orders</TableHead>
                        {configuredMethods.map((m) => (
                          <TableHead key={m} className="font-extrabold text-xs uppercase tracking-wider py-3.5 text-right">
                            {m}
                          </TableHead>
                        ))}
                        <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5 text-right">Total Expected</TableHead>
                        <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5 text-center">Holding Time</TableHead>
                        <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5 text-right pr-6">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActiveBalances.map((item) => {
                        const oldestAgeHours = item.oldestOrderAt
                          ? (Date.now() - new Date(item.oldestOrderAt).getTime()) / 3_600_000
                          : 0;
                        const isStale = oldestAgeHours >= 24;

                        return (
                          <TableRow key={item.staffId} className="hover:bg-muted/30 transition-colors border-b border-border/40">
                            {/* Staff Info Column */}
                            <TableCell className="py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 font-extrabold text-sm shrink-0">
                                  {item.staffName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-foreground">{item.staffName}</span>
                                    <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                      {item.staffRole}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {!item.accountLinked ? (
                                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                                        No login linked
                                      </Badge>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground font-medium">Linked Account</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>

                            {/* Orders Count Column */}
                            <TableCell className="text-center py-3.5">
                              <Badge variant="secondary" className="font-bold text-xs px-2.5 py-1">
                                {item.orderCount} {item.orderCount === 1 ? "Order" : "Orders"}
                              </Badge>
                            </TableCell>

                            {/* Payment Method Breakdown Columns */}
                            {configuredMethods.map((m) => {
                              const amt =
                                item.byMethod?.[m] ??
                                (m.toLowerCase() === "cash"
                                  ? item.expectedCash
                                  : m.toLowerCase().includes("card")
                                  ? item.expectedCard
                                  : 0);
                              return (
                                <TableCell key={m} className="text-right py-3.5 font-mono text-xs font-semibold text-muted-foreground">
                                  {amt > 0 ? (
                                    <span className="text-foreground font-bold">{currency} {amt.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-muted-foreground/40">-</span>
                                  )}
                                </TableCell>
                              );
                            })}

                            {/* Total Expected Column */}
                            <TableCell className="text-right py-3.5">
                              <span className="inline-flex items-center px-3 py-1 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 font-black font-mono text-sm shadow-sm">
                                {currency} {item.totalExpected.toLocaleString()}
                              </span>
                            </TableCell>

                            {/* Age / Holding Time Column */}
                            <TableCell className="text-center py-3.5">
                              {isStale ? (
                                <Badge variant="outline" className="text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {Math.floor(oldestAgeHours / 24)}+ day{Math.floor(oldestAgeHours / 24) === 1 ? "" : "s"}
                                </Badge>
                              ) : oldestAgeHours > 0 ? (
                                <span className="text-xs text-muted-foreground font-medium flex items-center justify-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground/60" />
                                  {Math.max(1, Math.floor(oldestAgeHours))}h ago
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground font-medium">-</span>
                              )}
                            </TableCell>

                            {/* Action Buttons Column */}
                            <TableCell className="text-right py-3.5 pr-6">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedStaffForOrders(item)}
                                  className="h-8 text-xs font-semibold gap-1.5 rounded-xl hover:bg-muted"
                                >
                                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                  Orders
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenSettlement(item)}
                                  disabled={!item.accountLinked}
                                  title={
                                    item.accountLinked
                                      ? undefined
                                      : "This staff member has no linked login account — link one before settling their cash"
                                  }
                                  className="h-8 text-xs font-extrabold gap-1.5 rounded-xl bg-amber-500 text-black hover:bg-amber-600 shadow-sm active:scale-95 transition-all"
                                >
                                  <Coins className="h-3.5 w-3.5" />
                                  Settle
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab 2: Audit Log (History) */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <Card className="p-3.5 sm:p-4 border-border/80 bg-card/90 backdrop-blur-md rounded-2xl shadow-sm">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search staff or settlement #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl bg-background"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full sm:w-[150px] h-9 text-xs rounded-xl bg-background font-semibold">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="Cashier">Cashiers</SelectItem>
                    <SelectItem value="Waiter">Waiters</SelectItem>
                    <SelectItem value="Delivery Rider">Delivery Riders</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full sm:w-[160px] h-9 text-xs rounded-xl bg-background font-semibold"
                />

                {(searchQuery || roleFilter !== "all" || dateFilter) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setRoleFilter("all");
                      setDateFilter("");
                    }}
                    className="h-9 text-xs font-semibold rounded-xl text-muted-foreground hover:text-foreground"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card className="border-border/80 bg-card/90 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm">
            {isLoadingHistory ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4].map((n) => (
                  <Skeleton key={n} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-xs font-semibold">
                No settlement records found matching criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40 border-b border-border/60">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5">Settlement #</TableHead>
                      <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5">Date & Time</TableHead>
                      <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5">Staff Member</TableHead>
                      <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5">Settled By</TableHead>
                      <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5 text-right">Expected</TableHead>
                      <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5 text-right">Actual</TableHead>
                      <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5 text-center">Difference</TableHead>
                      <TableHead className="font-extrabold text-xs uppercase tracking-wider py-3.5 text-right pr-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((item) => {
                      const diff = Number(item.cashDifference) || 0;
                      return (
                        <TableRow key={item.id} className="hover:bg-muted/30 transition-colors border-b border-border/40">
                          <TableCell className="font-mono text-xs font-extrabold text-foreground">
                            {item.settlementNo}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-medium">
                            {new Date(item.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-foreground">{item.staffName}</span>
                              <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                {item.staffRole}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-medium">
                            {item.settledByName}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold text-muted-foreground">
                            {currency} {Number(item.totalExpected).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                            {currency} {Number(item.totalActual).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center py-3.5">
                            {diff < 0 ? (
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] font-bold">
                                -{currency} {Math.abs(diff).toLocaleString()}
                              </Badge>
                            ) : diff > 0 ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                                +{currency} {diff.toLocaleString()}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] font-bold">
                                {currency} 0
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewHistoryRecord(item)}
                              className="h-8 text-xs font-semibold gap-1 rounded-xl hover:bg-muted"
                            >
                              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                              Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal 1: Settlement Dialog */}
      <Dialog
        open={Boolean(selectedStaffForSettlement)}
        onOpenChange={(open) => {
          if (!open) setSelectedStaffForSettlement(null);
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-500" />
              Settle Staff Collection
            </DialogTitle>
            <DialogDescription>
              Clear collections for{" "}
              <span className="font-semibold text-foreground">
                {selectedStaffForSettlement?.staffName}
              </span>{" "}
              ({selectedStaffForSettlement?.staffRole}).
            </DialogDescription>
          </DialogHeader>

          {selectedStaffForSettlement && (
            <div className="space-y-4 py-2">
              {/* Expected Breakdown Readonly Box */}
              <div className="bg-muted/40 p-3 rounded-lg border space-y-1.5 text-xs">
                <div className="font-semibold text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">
                  System Expected Collections (By Method)
                </div>
                {configuredMethods.map((m) => {
                  const expectedVal =
                    selectedStaffForSettlement.byMethod?.[m] ??
                    (m.toLowerCase() === "cash"
                      ? selectedStaffForSettlement.expectedCash
                      : m.toLowerCase().includes("card")
                      ? selectedStaffForSettlement.expectedCard
                      : 0);
                  return (
                    <div key={m} className="flex justify-between">
                      <span>{m}:</span>
                      <span className="font-medium">{currency} {expectedVal.toLocaleString()}</span>
                    </div>
                  );
                })}
                <div className="pt-1.5 border-t flex justify-between font-bold text-sm text-foreground">
                  <span>Total Expected:</span>
                  <span className="text-primary">{currency} {selectedStaffForSettlement.totalExpected.toLocaleString()}</span>
                </div>
              </div>

              {/* Actual Received Inputs for Configured Payment Methods */}
              <div className="space-y-3">
                <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Actual Received Amounts
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {configuredMethods.map((m) => (
                    <div key={m}>
                      <label className="text-xs font-medium block mb-1 truncate">{m}</label>
                      <Input
                        type="number"
                        min="0"
                        value={actualByMethodInput[m] ?? "0"}
                        onChange={(e) =>
                          setActualByMethodInput((prev) => ({
                            ...prev,
                            [m]: e.target.value,
                          }))
                        }
                        className="text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Difference Badge */}
              <div className="p-3 bg-card border rounded-lg flex items-center justify-between">
                <div className="text-xs">
                  <span className="text-muted-foreground block">Total Actual Received:</span>
                  <span className="font-bold text-sm">{currency} {modalTotalActual.toLocaleString()}</span>
                </div>
                <div>
                  {modalDiff === 0 ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 px-3 py-1">
                      <Check className="h-3.5 w-3.5 mr-1" /> Exact Match ({currency} 0)
                    </Badge>
                  ) : modalDiff < 0 ? (
                    <Badge className="bg-destructive/10 text-destructive border-destructive/30 px-3 py-1">
                      <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Shortage: -{currency} {Math.abs(modalDiff).toLocaleString()}
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 px-3 py-1">
                      <TrendingUp className="h-3.5 w-3.5 mr-1" /> Excess: +{currency} {modalDiff.toLocaleString()}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium block mb-1">Discrepancy / Settlement Notes</label>
                <Textarea
                  placeholder="Optional notes or reason for discrepancy..."
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  rows={2}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSelectedStaffForSettlement(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitSettlement}
              disabled={isSubmitting}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
            >
              {isSubmitting ? "Approving..." : "Approve & Clear Settlement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Staff Orders Dialog */}
      <Dialog
        open={Boolean(selectedStaffForOrders)}
        onOpenChange={(open) => {
          if (!open) setSelectedStaffForOrders(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Unsettled Orders ({selectedStaffForOrders?.staffName})
            </DialogTitle>
            <DialogDescription>
              Orders contributing to {selectedStaffForOrders?.staffName}'s current balance.
            </DialogDescription>
          </DialogHeader>

          {selectedStaffForOrders && (
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {(!selectedStaffForOrders.orders || selectedStaffForOrders.orders.length === 0) ? (
                <div className="text-center p-6 text-muted-foreground text-sm">
                  No individual order details available.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedStaffForOrders.orders.map((ord: any, idx: number) => (
                      <TableRow key={ord.id || idx}>
                        <TableCell className="font-mono text-xs font-semibold">
                          #{ord.orderNo || ord.orderNumber || ord.id?.substring(0, 8)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge
                            variant="outline"
                            className={
                              "text-[10px] font-semibold " +
                              (ord.channel === "Delivery Rider (COD)"
                                ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                                : ord.channel === "Waiter Panel"
                                ? "bg-purple-500/10 text-purple-500 border-purple-500/30"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30")
                            }
                          >
                            {ord.channel || ord.type || ord.orderType || "POS Counter"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {ord.customerName || ord.customer?.name || "Walk-in"}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {ord.paymentMethod || "Cash"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-xs">
                          {currency} {(Number(ord.staffAmount ?? ord.totalAmount ?? ord.total ?? 0)).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedStaffForOrders(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 3: History Detail Modal */}
      <Dialog
        open={Boolean(viewHistoryRecord)}
        onOpenChange={(open) => {
          if (!open) setViewHistoryRecord(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Settlement #{viewHistoryRecord?.settlementNo}
            </DialogTitle>
            <DialogDescription>
              Recorded on {viewHistoryRecord && new Date(viewHistoryRecord.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          {viewHistoryRecord && (
            <div className="space-y-4 py-2 text-xs max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2 bg-muted/40 p-3 rounded-lg border">
                <div>
                  <span className="text-muted-foreground block">Staff Member:</span>
                  <span className="font-semibold text-sm">{viewHistoryRecord.staffName}</span>
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {viewHistoryRecord.staffRole}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground block">Settled By (Manager):</span>
                  <span className="font-semibold text-sm">{viewHistoryRecord.settledByName}</span>
                </div>
              </div>

              {/* Table of Expected vs Actual */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-right text-xs">Expected</TableHead>
                      <TableHead className="text-right text-xs">Actual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configuredMethods.map((m) => {
                      const exp = viewHistoryRecord.paymentBreakdown?.expectedByMethod?.[m] ??
                        (m.toLowerCase() === "cash" ? Number(viewHistoryRecord.expectedCash) : m.toLowerCase().includes("card") ? Number(viewHistoryRecord.expectedCard) : 0);
                      const act = viewHistoryRecord.paymentBreakdown?.actualByMethod?.[m] ??
                        (m.toLowerCase() === "cash" ? Number(viewHistoryRecord.actualCash) : m.toLowerCase().includes("card") ? Number(viewHistoryRecord.actualCard) : 0);
                      return (
                        <TableRow key={m}>
                          <TableCell>{m}</TableCell>
                          <TableCell className="text-right">{currency} {exp.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">{currency} {act.toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-bold bg-muted/20">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right text-primary">{currency} {Number(viewHistoryRecord.totalExpected).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-primary">{currency} {Number(viewHistoryRecord.totalActual).toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Net Difference */}
              <div className="flex justify-between items-center p-3 border rounded-lg bg-card">
                <span className="font-semibold text-muted-foreground">Net Difference:</span>
                {Number(viewHistoryRecord.cashDifference) < 0 ? (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs px-2.5 py-0.5">
                    Shortage: -{currency} {Math.abs(Number(viewHistoryRecord.cashDifference)).toLocaleString()}
                  </Badge>
                ) : Number(viewHistoryRecord.cashDifference) > 0 ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs px-2.5 py-0.5">
                    Excess: +{currency} {Number(viewHistoryRecord.cashDifference).toLocaleString()}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground text-xs px-2.5 py-0.5">
                    Exact Match ({currency} 0)
                  </Badge>
                )}
              </div>

              {/* Notes */}
              <div>
                <span className="font-semibold text-muted-foreground block mb-1">Notes:</span>
                <p className="p-2.5 bg-muted/40 rounded-md border text-muted-foreground italic">
                  {viewHistoryRecord.notes || "No notes provided for this settlement."}
                </p>
              </div>

              {/* Included Orders Section */}
              <div className="space-y-2 pt-2 border-t">
                <span className="font-bold text-foreground block">
                  Included Orders ({viewHistoryRecord.orders?.length || 0})
                </span>
                {(!viewHistoryRecord.orders || viewHistoryRecord.orders.length === 0) ? (
                  <div className="text-center p-4 text-muted-foreground text-xs italic bg-muted/20 rounded-lg border">
                    No order logs linked to this settlement record.
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Order #</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                          <TableHead className="text-xs">Customer</TableHead>
                          <TableHead className="text-xs">Method</TableHead>
                          <TableHead className="text-right text-xs">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewHistoryRecord.orders.map((ord: any, idx: number) => (
                          <TableRow key={ord.id || idx}>
                            <TableCell className="font-mono text-xs font-semibold">
                              #{ord.orderNumber || ord.orderNo || ord.id?.substring(0, 8)}
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="outline" className="text-[10px] uppercase font-bold">
                                {ord.type || ord.orderType || "Dine In"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {ord.customerName || ord.customer?.name || "Walk-in"}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {ord.paymentMethod || "Cash"}
                            </TableCell>
                            <TableCell className="text-right font-bold text-xs">
                              {currency} {(Number(ord.total || ord.totalAmount || 0)).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewHistoryRecord(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CashHub;
