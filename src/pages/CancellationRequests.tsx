import { useState } from "react";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  cancellationRequestService,
  type CancellationRequestRecord,
} from "@/services/cancellationRequest.service";
import { userService } from "@/services/user.service";
import { useOutlet } from "@/contexts/OutletContext";

// Rank-and-file staff only — never a manager/admin (they're the approver pool, not
// someone who gets blamed/penalized for a cancellation).
const RESPONSIBLE_STAFF_ROLES = ["Cashier", "Kitchen Staff", "Kitchen Manager", "Waiter"];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

const CancellationRequests = () => {
  const { selectedOutletId } = useOutlet();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [penaltyEdits, setPenaltyEdits] = useState<Record<string, number>>({});
  const [responsibleEdits, setResponsibleEdits] = useState<Record<string, string>>({});
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["cancellation-requests", statusFilter, selectedOutletId],
    queryFn: () => cancellationRequestService.list(statusFilter === "all" ? undefined : { status: statusFilter }),
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
      <PageHeader
        icon={<Ban className="h-5 w-5" />}
        title="Cancellation Requests"
        subtitle="Review and approve/reject order-cancellation requests from staff"
      />

      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map(f => (
          <Button key={f} size="sm" variant={statusFilter === f ? "default" : "outline"} className="capitalize" onClick={() => setStatusFilter(f)}>
            {f}
          </Button>
        ))}
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
