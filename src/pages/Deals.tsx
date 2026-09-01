import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tag,
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  Layers,
  Percent,
  Gift,
  Ticket,
  PiggyBank,
  Download,
  Filter,
  Loader2,
  Check,
  Building2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { dealService, type DealRecord } from "@/services/deal.service";
import { outletService } from "@/services/outlet.service";
import { pktDateStr } from "@/lib/deals";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Deal type definitions with professional Lucide icons & clean labels
const formatTypeMap: Record<
  DealRecord["type"],
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  combo: { icon: Package, label: "Fixed Price Combo" },
  option_combo: { icon: Layers, label: "Customizable" },
  percentage: { icon: Percent, label: "% Discount" },
  buy_x_get_y: { icon: Gift, label: "BOGO (Buy X Get Y)" },
  promo_code: { icon: Ticket, label: "Promo Code" },
  min_spend: { icon: PiggyBank, label: "Minimum Spend Deal" },
};

type StatusFilterTab = "all" | "active" | "scheduled" | "expired" | "draft";

const Deals = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusFilterTab>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: () => dealService.getDeals(),
  });

  const { data: outlets = [] } = useQuery({
    queryKey: ["outlets"],
    queryFn: () => outletService.getOutlets(),
  });

  // Calculate live deal status helper
  const getDealStatus = (
    deal: DealRecord
  ): {
    statusKey: StatusFilterTab;
    label: string;
    dotClass: string;
    badgeClass: string;
  } => {
    const today = pktDateStr();
    if (!deal.isActive) {
      return {
        statusKey: "draft",
        label: "Draft",
        dotClass: "bg-muted-foreground/60",
        badgeClass: "border-border bg-muted/40 text-muted-foreground",
      };
    }
    if (deal.validTo && deal.validTo.slice(0, 10) < today) {
      return {
        statusKey: "expired",
        label: "Expired",
        dotClass: "bg-rose-500",
        badgeClass:
          "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
      };
    }
    if (deal.validFrom && deal.validFrom.slice(0, 10) > today) {
      return {
        statusKey: "scheduled",
        label: "Scheduled",
        dotClass: "bg-amber-500",
        badgeClass:
          "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
    }
    return {
      statusKey: "active",
      label: "Active",
      dotClass: "bg-emerald-500",
      badgeClass:
        "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  };

  // Live status counts for tab badges
  const counts = useMemo(() => {
    const today = pktDateStr();
    let active = 0;
    let scheduled = 0;
    let expired = 0;
    let draft = 0;

    deals.forEach((d) => {
      if (!d.isActive) {
        draft++;
      } else if (d.validTo && d.validTo.slice(0, 10) < today) {
        expired++;
      } else if (d.validFrom && d.validFrom.slice(0, 10) > today) {
        scheduled++;
      } else {
        active++;
      }
    });

    return {
      all: deals.length,
      active,
      scheduled,
      expired,
      draft,
    };
  }, [deals]);

  // Channel formatting helper
  const getAppliesToChannels = (deal: DealRecord): string => {
    const channels: string[] = [];
    if (deal.availableDineIn ?? true) channels.push("Dine In");
    if (deal.availableTakeaway ?? true) channels.push("Takeaway");
    if (deal.availableDelivery ?? true) channels.push("Delivery");
    return channels.length > 0 ? channels.join(", ") : "All Channels";
  };

  // Date formatting (DD/MM/YYYY)
  const formatDateDisplay = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "—";
    try {
      const raw = dateStr.slice(0, 10);
      const parts = raw.split("-");
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return new Date(dateStr).toLocaleDateString("en-GB");
    } catch {
      return dateStr;
    }
  };

  // End Date formatting
  const getEndDateDisplay = (deal: DealRecord): string => {
    if (!deal.validTo) return "Never Expires";
    return formatDateDisplay(deal.validTo);
  };

  // Branches label formatting
  const getBranchesLabel = (deal: DealRecord): string => {
    if (!deal.outletIds || deal.outletIds.length === 0) {
      return "All Branches";
    }
    if (deal.outletIds.length === 1) {
      const outlet = outlets.find((o) => o.id === deal.outletIds[0]);
      return outlet ? outlet.name : "1 Branch";
    }
    const matchedNames = deal.outletIds
      .map((id) => outlets.find((o) => o.id === id)?.name)
      .filter(Boolean);
    if (matchedNames.length <= 2) {
      return matchedNames.join(", ");
    }
    return `${deal.outletIds.length} Branches`;
  };

  // Filtered dataset
  const filtered = useMemo(() => {
    return deals.filter((d) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = d.name.toLowerCase().includes(q);
        const matchCode = d.code ? d.code.toLowerCase().includes(q) : false;
        const matchDesc = d.description
          ? d.description.toLowerCase().includes(q)
          : false;
        if (!matchName && !matchCode && !matchDesc) return false;
      }

      // Status Tab
      if (statusTab !== "all") {
        const { statusKey } = getDealStatus(d);
        if (statusKey !== statusTab) return false;
      }

      // Type Filter
      if (typeFilter !== "all" && d.type !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [deals, search, statusTab, typeFilter]);

  // Actions
  const handleToggleActive = async (deal: DealRecord) => {
    setTogglingId(deal.id);
    try {
      const updated = await dealService.toggleDeal(deal.id);
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success(
        `Deal "${deal.name}" is now ${updated.isActive ? "Active" : "Inactive"}`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update deal status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      const message = await dealService.deleteDeal(id);
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success(message || `Deal "${name}" deleted`);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete deal");
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error("No deals to export");
      return;
    }
    const headers = [
      "Sr #",
      "Deal Name",
      "Deal Code",
      "Deal Type",
      "Applies To",
      "Status",
      "Start Date",
      "End Date",
      "Branches",
    ];
    const rows = filtered.map((deal, idx) => {
      const status = getDealStatus(deal).label;
      const branches = getBranchesLabel(deal);
      const appliesTo = getAppliesToChannels(deal);
      const startDate = formatDateDisplay(deal.validFrom);
      const endDate = getEndDateDisplay(deal);
      const typeLabel = formatTypeMap[deal.type]?.label || deal.type;

      return [
        idx + 1,
        `"${(deal.name || "").replace(/"/g, '""')}"`,
        `"${(deal.code || "").replace(/"/g, '""')}"`,
        `"${typeLabel}"`,
        `"${appliesTo}"`,
        `"${status}"`,
        `"${startDate}"`,
        `"${endDate}"`,
        `"${branches.replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `deals_export_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Deals exported successfully");
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-full overflow-hidden">
      {/* Page Header */}
      <PageHeader
        icon={<Tag className="h-5 w-5" />}
        title="Deals & Combos"
        subtitle="Manage combo meals, bundles, and promotional offers"
        actions={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs h-9 gap-1.5 shadow-xs w-full sm:w-auto"
            onClick={() => navigate("/deals/add")}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Create Deal & Combo</span>
          </Button>
        }
      />

      {/* Main Table Card */}
      <Card className="shadow-xs border-border/80 overflow-hidden">
        <CardHeader className="p-3 sm:p-4 border-b bg-card space-y-3 sm:space-y-0">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
            {/* Left: Status Filter Tab Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 scrollbar-none">
              <span className="text-xs sm:text-sm font-bold text-foreground shrink-0 mr-1 whitespace-nowrap">
                All Deals
              </span>

              {[
                {
                  key: "all" as const,
                  label: "All",
                  count: counts.all,
                  badgeStyle: "bg-muted text-muted-foreground",
                },
                {
                  key: "active" as const,
                  label: "Active",
                  count: counts.active,
                  badgeStyle:
                    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold",
                },
                {
                  key: "scheduled" as const,
                  label: "Scheduled",
                  count: counts.scheduled,
                  badgeStyle:
                    "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold",
                },
                {
                  key: "expired" as const,
                  label: "Expired",
                  count: counts.expired,
                  badgeStyle:
                    "bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold",
                },
                {
                  key: "draft" as const,
                  label: "Draft",
                  count: counts.draft,
                  badgeStyle: "bg-muted text-muted-foreground font-semibold",
                },
              ].map((tab) => {
                const isSelected = statusTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setStatusTab(tab.key);
                      setPage(1);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none border shrink-0 whitespace-nowrap",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-muted/30 hover:bg-muted/70 text-muted-foreground border-border/70"
                    )}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold leading-none",
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : tab.badgeStyle
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right: Search, Filters & Export */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full xl:w-auto">
              {/* Search Bar */}
              <div className="relative flex-1 sm:w-60 min-w-[150px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search deals..."
                  className="pl-8 h-8 text-xs bg-background w-full"
                />
              </div>

              {/* Format Filter Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 text-xs gap-1.5 shrink-0 whitespace-nowrap",
                      typeFilter !== "all" && "border-primary text-primary font-semibold"
                    )}
                  >
                    <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>
                      {typeFilter === "all"
                        ? "Filters"
                        : formatTypeMap[typeFilter as DealRecord["type"]]?.label ||
                          "Filtered"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs font-bold">
                    Filter by Format
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setTypeFilter("all");
                      setPage(1);
                    }}
                    className="text-xs flex items-center justify-between cursor-pointer"
                  >
                    <span>All Formats</span>
                    {typeFilter === "all" && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                  {Object.entries(formatTypeMap).map(([key, info]) => {
                    const Icon = info.icon;
                    return (
                      <DropdownMenuItem
                        key={key}
                        onClick={() => {
                          setTypeFilter(key);
                          setPage(1);
                        }}
                        className="text-xs flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{info.label}</span>
                        </div>
                        {typeFilter === key && (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Export Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="h-8 text-xs gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>Export</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-20">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
              <p className="text-xs text-muted-foreground mt-2">Loading deals & combos...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <Tag className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">No Deals & Combos Found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {search || statusTab !== "all" || typeFilter !== "all"
                  ? "No deals matched your current filters. Try resetting search or filter tabs."
                  : "Create your first combo meal, percentage discount, or promotional offer."}
              </p>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 font-semibold text-xs h-8 gap-1.5"
                onClick={() => navigate("/deals/add")}
              >
                <Plus className="h-3.5 w-3.5" />
                Create Deal & Combo
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto w-full">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/70">
                      <TableHead className="text-xs font-bold text-foreground py-3 px-3 w-16 text-center whitespace-nowrap">
                        Sr #
                      </TableHead>
                      <TableHead className="text-xs font-bold text-foreground py-3 min-w-[180px] whitespace-nowrap">
                        Deal Name
                      </TableHead>
                      <TableHead className="text-xs font-bold text-foreground py-3 min-w-[120px] whitespace-nowrap">
                        Deal Code
                      </TableHead>
                      <TableHead className="text-xs font-bold text-foreground py-3 min-w-[160px] whitespace-nowrap">
                        Deal Type
                      </TableHead>
                      <TableHead className="text-xs font-bold text-foreground py-3 min-w-[180px] whitespace-nowrap">
                        Applies To
                      </TableHead>
                      <TableHead className="text-xs font-bold text-foreground py-3 min-w-[110px] whitespace-nowrap">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-bold text-foreground py-3 min-w-[110px] whitespace-nowrap">
                        Start Date
                      </TableHead>
                      <TableHead className="text-xs font-bold text-foreground py-3 min-w-[120px] whitespace-nowrap">
                        End Date
                      </TableHead>
                      <TableHead className="text-xs font-bold text-foreground py-3 min-w-[140px] whitespace-nowrap">
                        Branches
                      </TableHead>
                      <TableHead className="text-xs font-bold text-foreground py-3 w-28 text-right pr-4 whitespace-nowrap">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginate(filtered, page, 10).map((deal, idx) => {
                      const typeInfo = formatTypeMap[deal.type] ?? {
                        icon: Tag,
                        label: deal.type,
                      };
                      const TypeIcon = typeInfo.icon;
                      const statusInfo = getDealStatus(deal);
                      const serialNumber = (page - 1) * 10 + idx + 1;

                      return (
                        <TableRow
                          key={deal.id}
                          className="hover:bg-muted/25 transition-colors border-b border-border/60"
                        >
                          {/* Serial Number */}
                          <TableCell className="py-3 px-3 text-center text-xs font-mono font-medium text-muted-foreground whitespace-nowrap">
                            {serialNumber}
                          </TableCell>

                          {/* Deal Name */}
                          <TableCell className="py-3 font-semibold text-xs text-foreground whitespace-nowrap" title={deal.name}>
                            {deal.name}
                          </TableCell>

                          {/* Deal Code */}
                          <TableCell className="py-3 whitespace-nowrap">
                            {deal.code ? (
                              <span className="font-mono text-xs font-semibold text-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/60">
                                {deal.code}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 font-mono">
                                —
                              </span>
                            )}
                          </TableCell>

                          {/* Deal Type */}
                          <TableCell className="py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                              <TypeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>{typeInfo.label}</span>
                            </div>
                          </TableCell>

                          {/* Applies To Channels */}
                          <TableCell className="py-3 whitespace-nowrap">
                            <span className="text-xs text-foreground/90 font-medium" title={getAppliesToChannels(deal)}>
                              {getAppliesToChannels(deal)}
                            </span>
                          </TableCell>

                          {/* Status */}
                          <TableCell className="py-3 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-full border shadow-none",
                                statusInfo.badgeClass
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0",
                                  statusInfo.dotClass
                                )}
                              />
                              {statusInfo.label}
                            </Badge>
                          </TableCell>

                          {/* Start Date */}
                          <TableCell className="py-3 whitespace-nowrap">
                            <span className="text-xs font-mono text-foreground font-medium">
                              {formatDateDisplay(deal.validFrom)}
                            </span>
                          </TableCell>

                          {/* End Date */}
                          <TableCell className="py-3 whitespace-nowrap">
                            <span className="text-xs font-mono text-foreground font-medium">
                              {getEndDateDisplay(deal)}
                            </span>
                          </TableCell>

                          {/* Branches */}
                          <TableCell className="py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-xs text-foreground">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>{getBranchesLabel(deal)}</span>
                            </div>
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="py-3 text-right pr-4 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {/* Toggle active status */}
                              <Switch
                                checked={deal.isActive}
                                disabled={togglingId === deal.id}
                                onCheckedChange={() => handleToggleActive(deal)}
                                className="scale-75 origin-right mr-1"
                                title={deal.isActive ? "Deactivate deal" : "Activate deal"}
                              />

                              {/* Edit */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                onClick={() => navigate(`/deals/edit/${deal.id}`)}
                                title="Edit Deal"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>

                              {/* Delete Dialog */}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    title="Delete Deal"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Deal & Combo?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete <strong>{deal.name}</strong>?
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(deal.id, deal.name)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Table Pagination */}
              <div className="p-3 sm:p-4 border-t border-border/70 flex flex-col sm:flex-row items-center justify-between gap-3">
                <TablePagination
                  currentPage={page}
                  totalItems={filtered.length}
                  pageSize={10}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Deals;
