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
    refetchActive();
    refetchHistory();
    queryClient.invalidateQueries({ queryKey: ["active-cash-balances"] });
    queryClient.invalidateQueries({ queryKey: ["cash-settlement-history"] });
  };

  useModuleEvents(["cashSettlement:created"], refetchAll);
  useVisiblePolling(refetchAll, 60000);

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
    <div className="space-y-6 p-4 md:p-6 pb-12 max-w-7xl mx-auto">
      {/* Page Header */}
      <PageHeader
        icon={<Coins className="h-6 w-6" />}
        title="Cash Reconciliation Hub"
        subtitle="Active staff collections & settlement approvals"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAll()}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* 4 Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Uncleared Floor Cash
            </CardTitle>
            <Banknote className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currency} {totalUnclearedCash.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sum across active staff
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Staff Holding Cash
            </CardTitle>
            <UserCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeStaffCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Staff members with collections
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Settled Today
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currency} {totalCashSettledToday.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Approved today's actual collections
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today Net Difference
            </CardTitle>
            {todayNetDifference >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent className="flex flex-col justify-between">
            <div className="text-2xl font-bold">
              {todayNetDifference > 0
                ? `+${currency} ${todayNetDifference.toLocaleString()}`
                : todayNetDifference < 0
                ? `-${currency} ${Math.abs(todayNetDifference).toLocaleString()}`
                : `${currency} 0`}
            </div>
            <div className="mt-2">
              {todayNetDifference < 0 ? (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Shortage
                </Badge>
              ) : todayNetDifference > 0 ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  <Check className="h-3 w-3 mr-1" /> Excess
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  Exact Match
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "active" | "history")}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="active" className="gap-2">
            <Coins className="h-4 w-4" />
            Live Balances
            {activeStaffCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0.2 text-xs">
                {activeStaffCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <FileText className="h-4 w-4" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Live Balances */}
        <TabsContent value="active" className="space-y-4 mt-4">
          {isLoadingActive ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((n) => (
                <Card key={n} className="p-4 space-y-3">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-8 w-full" />
                </Card>
              ))}
            </div>
          ) : activeBalances.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <CardContent className="space-y-3 pt-6">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                <h3 className="text-lg font-semibold">All Clear!</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  No uncleared cash balances on the floor. All staff sales are currently settled.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeBalances.map((item) => (
                <Card key={item.staffId} className="flex flex-col justify-between shadow-sm border-border hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {item.staffName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <CardTitle className="text-base">{item.staffName}</CardTitle>
                          <Badge variant="outline" className="mt-1 text-xs">
                            {item.staffRole}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {item.orderCount} {item.orderCount === 1 ? "Order" : "Orders"}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 py-2 flex-grow">
                    {/* Dynamic Breakdown Pills for configured Payment Methods */}
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {configuredMethods.map((m) => {
                        const amt = item.byMethod?.[m] ?? (m.toLowerCase() === "cash" ? item.expectedCash : m.toLowerCase().includes("card") ? item.expectedCard : 0);
                        return (
                          <div key={m} className="bg-muted/50 rounded-lg p-1.5 px-2 border border-border/50 flex-1 min-w-[75px] text-center">
                            <span className="text-[10px] text-muted-foreground block uppercase font-medium truncate">{m}</span>
                            <span className="text-xs font-semibold">{currency} {amt.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Total Expected */}
                    <div className="pt-2 border-t flex justify-between items-center">
                      <span className="text-xs text-muted-foreground font-medium">Total Expected:</span>
                      <span className="text-lg font-bold text-primary">
                        {currency} {item.totalExpected.toLocaleString()}
                      </span>
                    </div>
                  </CardContent>

                  <div className="p-4 pt-0 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedStaffForOrders(item)}
                      className="w-full text-xs"
                    >
                      View Orders
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenSettlement(item)}
                      className="w-full text-xs"
                    >
                      Settle Cash
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Audit Log (History) */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <Card className="p-4 border-border">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search staff or settlement #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="Cashier">Cashier</SelectItem>
                    <SelectItem value="Waiter">Waiter</SelectItem>
                    <SelectItem value="Delivery Rider">Delivery Rider</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-[160px]"
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
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card className="border-border overflow-hidden">
            {isLoadingHistory ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4].map((n) => (
                  <Skeleton key={n} className="h-10 w-full" />
                ))}
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                No cash settlement records found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Settlement #</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Settled By</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-center">Difference</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((item) => {
                      const diff = Number(item.cashDifference) || 0;
                      return (
                        <TableRow key={item.id} className="hover:bg-muted/40">
                          <TableCell className="font-mono text-xs font-semibold">
                            {item.settlementNo}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{item.staffName}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {item.staffRole}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.settledByName}
                          </TableCell>
                          <TableCell className="text-right font-medium text-xs">
                            {currency} {Number(item.totalExpected).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-xs">
                            {currency} {Number(item.totalActual).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            {diff < 0 ? (
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
                                -{currency} {Math.abs(diff).toLocaleString()}
                              </Badge>
                            ) : diff > 0 ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs">
                                +{currency} {diff.toLocaleString()}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
                                {currency} 0
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewHistoryRecord(item)}
                              className="h-8 text-xs"
                            >
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
              <Coins className="h-5 w-5 text-primary" />
              Settle Staff Cash
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
            >
              {isSubmitting ? "Approving..." : "Approve & Clear Logs"}
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
                      <TableHead>Type</TableHead>
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
                          <Badge variant="outline" className="text-[10px]">
                            {ord.type || ord.orderType || "Dine In"}
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
