import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  cancellationRequestService,
  type CancellationRequestRecord,
} from "@/services/cancellationRequest.service";
import { userService } from "@/services/user.service";
import { useOutletFilter } from "@/hooks/useOutletFilter";
import { OutletFilterSelect } from "@/components/OutletFilterSelect";
import { useModuleEvents } from "@/hooks/use-module-events";
import { api } from "@/services/api";

/** "YYYY-MM-DD" from local Y/M/D parts — same reasoning as Sales.tsx's toYmd. */
function toYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Rank-and-file staff only — never a manager/admin (they're the approver pool, not
// someone who gets blamed/penalized for a cancellation).
const RESPONSIBLE_STAFF_ROLES = ["Cashier", "Kitchen Staff", "Kitchen Manager", "Waiter"];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

const CancellationRequests = () => {
  const { outletId: selectedOutletId, setOutletId, outlets, isSuperAdmin } = useOutletFilter();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [penaltyEdits, setPenaltyEdits] = useState<Record<string, number>>({});
  const [responsibleEdits, setResponsibleEdits] = useState<Record<string, string>>({});
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // Arriving from the Dashboard's "Cancellation Requests" section pre-fills the date range
  // (+ status/reason/responsible-staff for a specific tile/bar/row drill-down) via
  // ?from=&to=&status=&reason=&responsibleUserId=&responsibleName=. Re-seeds on every genuinely
  // new navigation (not just first mount) — the same `useEffect` keyed on `searchParams` Sales.tsx
  // uses, fixing the "second drill-down from the same tab doesn't update" bug found there; safe
  // against fighting this page's own in-page filter clicks since those never touch the URL.
  const [searchParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [reasonFilter, setReasonFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [responsibleFilterName, setResponsibleFilterName] = useState("");

  useEffect(() => {
    setDateFrom(searchParams.get("from") || "");
    setDateTo(searchParams.get("to") || "");
    setActivePreset(null);
    setReasonFilter(searchParams.get("reason") || "");
    setResponsibleFilter(searchParams.get("responsibleUserId") || "");
    setResponsibleFilterName(searchParams.get("responsibleName") || "");
    const statusParam = searchParams.get("status");
    if (statusParam) setStatusFilter(statusParam as "pending" | "approved" | "rejected" | "all");
  }, [searchParams]);

  const applyPreset = (preset: "Today" | "This Week" | "This Month") => {
    const now = new Date();
    if (preset === "Today") {
      setDateFrom(toYmd(now)); setDateTo(toYmd(now));
    } else if (preset === "This Week") {
      const from = new Date(now); from.setDate(from.getDate() - 7);
      setDateFrom(toYmd(from)); setDateTo(toYmd(now));
    } else {
      setDateFrom(toYmd(new Date(now.getFullYear(), now.getMonth(), 1))); setDateTo(toYmd(now));
    }
    setActivePreset(preset);
  };
  const handleDateFrom = (v: string) => { setDateFrom(v); setActivePreset(null); };
  const handleDateTo = (v: string) => { setDateTo(v); setActivePreset(null); };
  const clearDates = () => { setDateFrom(""); setDateTo(""); setActivePreset(null); };

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["cancellation-requests", statusFilter, selectedOutletId, dateFrom, dateTo, reasonFilter, responsibleFilter],
    queryFn: () => {
      // api.ts caches GETs for 30s, so an event-driven invalidation would otherwise
      // be served the same stale list it was pushed to replace.
      api.clearCache('/cancellation-requests');
      return cancellationRequestService.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        outletId: selectedOutletId !== "all" ? selectedOutletId : undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        reason: reasonFilter || undefined,
        responsibleUserId: responsibleFilter || undefined,
      });
    },
    // Cancellation-request push events (below) are the primary freshness mechanism, and
    // the hook also refetches on reconnect, so a dropped-and-restored socket catches up
    // on its own. This interval is the last-resort floor for a socket that NEVER connects
    // (the client is websocket-only with no HTTP fallback, and a failed auth handshake is
    // silent). Left at the react-query default of not refetching in the background, so a
    // hidden tab stops polling and Neon's compute can scale to zero.
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });

  // Live updates: the backend pushes cancellation-request changes to this outlet's room
  // only, so any event we receive is relevant to this approver. Invalidate the same key
  // the review mutation uses, so every status-filter and outlet variant refetches.
  const CANCELLATION_REQUEST_EVENTS = ["cancellationRequest:created", "cancellationRequest:updated"] as const;
  useModuleEvents(CANCELLATION_REQUEST_EVENTS, (payload: any) => {
    queryClient.invalidateQueries({ queryKey: ["cancellation-requests"] });

    const orderNo = payload?.order?.orderNumber;
    if (!orderNo) return;
    if (payload.status === "pending") {
      toast.info(`New cancellation request for order ${orderNo} by ${payload.requestedBy?.name ?? "staff"}`);
    } else if (payload.status === "approved") {
      toast.success(`Cancellation for order ${orderNo} approved`);
    } else if (payload.status === "rejected") {
      toast.error(`Cancellation for order ${orderNo} rejected`);
    }
  });

  const { data: staffPicker = [] } = useQuery({
    queryKey: ["cancellation-requests-staff-picker", selectedOutletId],
    queryFn: () => userService.getStaffPicker(
      RESPONSIBLE_STAFF_ROLES,
      selectedOutletId && selectedOutletId !== "all" ? selectedOutletId : undefined,
    ),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, action, penaltyAmount, responsibleUserId, note }: {
      id: string; action: "approve" | "reject"; penaltyAmount?: number; responsibleUserId?: string | null; note?: string;
    }) => cancellationRequestService.review(id, { action, penaltyAmount, responsibleUserId, note }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["cancellation-requests"] });
      toast.success(variables.action === "approve" ? "Order cancelled" : "Request rejected");
      setRejectId(null);
      setRejectNote("");
    },
    onError: (err: any) => toast.error(err.message || "Failed to review request"),
  });

  const handleApprove = (r: CancellationRequestRecord) => {
    reviewMut.mutate({
      id: r.id,
      action: "approve",
      penaltyAmount: penaltyEdits[r.id] ?? r.penaltyAmount,
      responsibleUserId: responsibleEdits[r.id] ?? r.responsibleUserId ?? undefined,
    });
  };

  const currency = "Rs.";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <PageHeader
          icon={<Ban className="h-5 w-5" />}
          title="Cancellation Requests"
          subtitle="Review and approve/reject order-cancellation requests from staff"
        />
        <OutletFilterSelect outletId={selectedOutletId} setOutletId={setOutletId} outlets={outlets} isSuperAdmin={isSuperAdmin} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map(f => (
          <Button key={f} size="sm" variant={statusFilter === f ? "default" : "outline"} className="capitalize" onClick={() => setStatusFilter(f)}>
            {f}
          </Button>
        ))}
      </div>

      {/* Date range — mirrors Sales.tsx/Expenses.tsx's filter bar (no time-of-day, a
          cancellation is a discrete event, not hourly). Seeded from the Dashboard's
          Cancellation Requests section drill-down. */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60 shadow-sm">
          {(["Today", "This Week", "This Month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                activePreset === p ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1.5">
          <div className="w-36"><DatePicker value={dateFrom} onChange={handleDateFrom} placeholder="Start date" className="h-8 text-xs bg-background" /></div>
          <span className="text-xs text-muted-foreground/60 font-medium px-0.5">to</span>
          <div className="w-36"><DatePicker value={dateTo} onChange={handleDateTo} min={dateFrom || undefined} placeholder="End date" className="h-8 text-xs bg-background" /></div>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={clearDates} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md" title="Clear date filter">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {reasonFilter && (
          <Badge variant="outline" className="h-8 px-3 gap-1.5 text-xs font-normal border-primary/30 bg-primary/5 text-primary">
            Reason: {reasonFilter}
            <button type="button" onClick={() => setReasonFilter("")} className="hover:text-destructive"><X className="h-3 w-3" /></button>
          </Badge>
        )}
        {responsibleFilter && (
          <Badge variant="outline" className="h-8 px-3 gap-1.5 text-xs font-normal border-primary/30 bg-primary/5 text-primary">
            Staff: {responsibleFilterName || responsibleFilter}
            <button type="button" onClick={() => { setResponsibleFilter(""); setResponsibleFilterName(""); }} className="hover:text-destructive"><X className="h-3 w-3" /></button>
          </Badge>
        )}
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Order</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Approver</TableHead>
                  <TableHead>Responsible Person</TableHead>
                  <TableHead>Penalty</TableHead>
                  <TableHead>Refund</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/20 align-top">
                    <TableCell>
                      <p className="text-sm font-medium">{r.order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{r.order.date.slice(0, 10)} {r.order.time || ""}</p>
                      <p className="text-xs text-muted-foreground">{currency} {r.order.total.toLocaleString()}</p>
                    </TableCell>
                    <TableCell className="text-sm max-w-[160px]">{r.reason}</TableCell>
                    <TableCell className="text-sm">{r.requestedBy?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.approver?.name ?? "—"}</TableCell>
                    <TableCell className="min-w-[160px]">
                      {r.status === "pending" ? (
                        <Select
                          value={responsibleEdits[r.id] ?? r.responsibleUserId ?? ""}
                          onValueChange={(v) => setResponsibleEdits(prev => ({ ...prev, [r.id]: v }))}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            {staffPicker.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{r.responsibleUser?.name ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[110px]">
                      {r.status === "pending" ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">{currency}</span>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-20 text-xs"
                            value={penaltyEdits[r.id] ?? r.penaltyAmount}
                            onChange={(e) => setPenaltyEdits(prev => ({ ...prev, [r.id]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          />
                        </div>
                      ) : (
                        <span className="text-sm">{currency} {r.penaltyAmount.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {currency} {r.refundAmount.toLocaleString()}
                      <p className="text-xs text-muted-foreground capitalize">{r.refundMethod}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("text-xs capitalize", STATUS_COLORS[r.status])}>{r.status}</Badge>
                      {r.status !== "pending" && r.reviewedBy && (
                        <p className="text-[10px] text-muted-foreground mt-1">by {r.reviewedBy.name}</p>
                      )}
                      {r.reviewNote && <p className="text-[10px] text-muted-foreground italic">"{r.reviewNote}"</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" className="h-7 text-xs bg-success hover:bg-success/90 text-white"
                            onClick={() => handleApprove(r)} disabled={reviewMut.isPending}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30"
                            onClick={() => setRejectId(rejectId === r.id ? null : r.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {requests.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No {statusFilter !== "all" ? statusFilter : ""} cancellation requests
                  </TableCell></TableRow>
                )}
                {rejectId && (
                  <TableRow>
                    <TableCell colSpan={9} className="pt-0 pb-3 px-4">
                      <div className="space-y-2 border-t pt-2">
                        <Textarea placeholder="Rejection note (optional)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={2} className="text-sm" />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectNote(""); }}>Cancel</Button>
                          <Button size="sm" variant="destructive" onClick={() => reviewMut.mutate({ id: rejectId, action: "reject", note: rejectNote })}>
                            Confirm Reject
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CancellationRequests;
