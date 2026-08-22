import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tag, Plus, Search, Pencil, Trash2, Package, Layers, Sparkles, Clock, Calendar, Loader2, Percent, Gift } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { dealService, type DealRecord } from "@/services/deal.service";
import { menuService } from "@/services/menu.service";
import { isDealLive, dealExpiryLabel, pktDateStr } from "@/lib/deals";
import { toast } from "sonner";

const Deals = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"All" | "Active" | "Fixed" | "Custom" | "Inactive" | "Expired">("All");
  const [page, setPage] = useState(1);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: () => dealService.getDeals(),
  });

  const { data: menuItems = [] } = useQuery({
    queryKey: ["menu-items"],
    queryFn: () => menuService.getMenuItems({ limit: 500 }),
  });

  const filtered = deals.filter((d) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = d.name.toLowerCase().includes(q);
      const matchCode = d.code ? d.code.toLowerCase().includes(q) : false;
      const matchDesc = d.description ? d.description.toLowerCase().includes(q) : false;
      if (!matchName && !matchCode && !matchDesc) return false;
    }

    if (filterTab === "Active") return isDealLive(d).valid;
    if (filterTab === "Fixed") return d.type === "combo";
    if (filterTab === "Custom") return d.type === "option_combo";
    if (filterTab === "Inactive") return !d.isActive;
    if (filterTab === "Expired") return !!d.validTo && d.validTo.slice(0, 10) < pktDateStr();

    return true;
  });

  const handleToggleActive = async (deal: DealRecord) => {
    setTogglingId(deal.id);
    try {
      const updated = await dealService.toggleDeal(deal.id);
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success(`Deal "${deal.name}" is now ${updated.isActive ? "Active" : "Inactive"}`);
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
      toast.success(message || `Deal "${name}" removed`);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete deal");
    }
  };

  const itemName = (id: string) => menuItems.find((m) => m.id === id)?.name || "Item";

  // Format included items preview summary
  const getIncludedItemsSummary = (deal: DealRecord) => {
    if (deal.type === "combo" && deal.components.length > 0) {
      return deal.components
        .map((c) => `${c.qty}x ${itemName(c.menuItemId)}`)
        .join(", ");
    }
    if (deal.type === "option_combo" && deal.optionGroups.length > 0) {
      return `${deal.optionGroups.length} Choice Step(s): ${deal.optionGroups.map((g) => g.label).join(" + ")}`;
    }
    if (deal.type === "percentage" || deal.type === "time_based") {
      const items = deal.applicableItems.map(itemName);
      const scope = items.length > 0 ? items.join(", ") : `${deal.applicableCategories.length} categor${deal.applicableCategories.length === 1 ? "y" : "ies"}`;
      return `${deal.discountPercent}% off: ${scope}`;
    }
    if (deal.type === "buy_x_get_y" && deal.buyItemId && deal.getItemId) {
      return `Buy ${deal.buyQty} ${itemName(deal.buyItemId)} → Get ${deal.getQty} ${itemName(deal.getItemId)} Free`;
    }
    return deal.description || "Promotional combo deal";
  };

  // Format the offer-price column for any deal type
  const getValueDisplay = (deal: DealRecord) => {
    if (deal.type === "combo" || deal.type === "option_combo") {
      return deal.price != null ? `Rs. ${deal.price.toLocaleString()}` : "—";
    }
    if (deal.type === "percentage" || deal.type === "time_based") {
      return `${deal.discountPercent}% OFF`;
    }
    return "Free Item";
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        icon={<Tag className="h-5 w-5" />}
        title="Deals & Combos"
        subtitle="Manage combo meals, bundles, and promotional offers"
        actions={
          <Button
            className="gradient-primary text-primary-foreground font-semibold shadow-xs"
            onClick={() => navigate("/deals/add")}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create Deal & Combo
          </Button>
        }
      />

      {/* Main Table Card */}
      <Card className="shadow-sm border-border/80">
        <CardHeader className="pb-3 border-b bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
            {/* Search */}
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search deals by name or code..."
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  { key: "All", label: "All Deals" },
                  { key: "Active", label: "🟢 Active" },
                  { key: "Fixed", label: "📦 Fixed Bundles" },
                  { key: "Custom", label: "🎯 Customizable" },
                  { key: "Inactive", label: "Draft / Inactive" },
                  { key: "Expired", label: "Expired" },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.key}
                  variant={filterTab === tab.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setFilterTab(tab.key);
                    setPage(1);
                  }}
                  className={`h-8 text-xs ${
                    filterTab === tab.key ? "gradient-primary text-primary-foreground" : ""
                  }`}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-16">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <Tag className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-foreground">No Deals & Combos Found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {search
                  ? "No deals matched your search query."
                  : "Create your first pizza combo, family bundle, or special meal deal."}
              </p>
              <Button
                size="sm"
                className="gradient-primary text-primary-foreground mt-4 font-semibold text-xs"
                onClick={() => navigate("/deals/add")}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Deal & Combo
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                      <TableHead className="w-10">SN</TableHead>
                      <TableHead className="min-w-[200px]">Deal Details</TableHead>
                      <TableHead className="min-w-[130px]">Format</TableHead>
                      <TableHead className="min-w-[240px]">Included Items / Steps</TableHead>
                      <TableHead className="w-32 text-right">Offer Price</TableHead>
                      <TableHead className="w-40">Validity</TableHead>
                      <TableHead className="w-20 text-center">Active</TableHead>
                      <TableHead className="w-20 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginate(filtered, page, 10).map((deal, i) => {
                      const formatBadge: Record<DealRecord["type"], { icon: typeof Package; label: string; className: string }> = {
                        combo: { icon: Package, label: "Fixed Bundle", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
                        option_combo: { icon: Layers, label: "Customizable", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
                        percentage: { icon: Percent, label: "Percentage Off", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
                        time_based: { icon: Clock, label: "Time-Based", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
                        buy_x_get_y: { icon: Gift, label: "Buy X Get Y", className: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
                      };
                      const badge = formatBadge[deal.type];
                      const BadgeIcon = badge.icon;

                      return (
                        <TableRow key={deal.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {(page - 1) * 10 + i + 1}
                          </TableCell>

                          {/* Deal Name & Details */}
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {deal.image ? (
                                <img
                                  src={deal.image}
                                  alt={deal.name}
                                  className="h-10 w-10 rounded-lg object-cover shrink-0 border"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 border border-primary/20">
                                  <BadgeIcon className="h-5 w-5" />
                                </div>
                              )}
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-xs text-foreground">{deal.name}</p>
                                  {deal.code && (
                                    <Badge variant="outline" className="text-[10px] font-mono px-1 py-0 h-4">
                                      {deal.code}
                                    </Badge>
                                  )}
                                </div>
                                {deal.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-xs">
                                    {deal.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Format Badge */}
                          <TableCell>
                            <Badge variant="secondary" className={`${badge.className} text-[11px] gap-1`}>
                              <BadgeIcon className="h-3 w-3" /> {badge.label}
                            </Badge>
                          </TableCell>

                          {/* Included Items Summary */}
                          <TableCell>
                            <p className="text-xs text-foreground/90 font-medium line-clamp-2 max-w-sm">
                              {getIncludedItemsSummary(deal)}
                            </p>
                          </TableCell>

                          {/* Price */}
                          <TableCell className="text-right">
                            <div className="space-y-0.5">
                              <p className="font-mono font-extrabold text-sm text-foreground">
                                {getValueDisplay(deal)}
                              </p>
                              {deal.dineInPrice || deal.deliveryPrice ? (
                                <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                                  {deal.dineInPrice != null && <span>Dine: {deal.dineInPrice}</span>}
                                  {deal.deliveryPrice != null && <span>Del: {deal.deliveryPrice}</span>}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>

                          {/* Validity */}
                          <TableCell>
                            <div className="space-y-0.5 text-xs">
                              {!deal.validTo ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                                  <Sparkles className="h-3 w-3" /> Always Active
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 text-[11px] ${!isDealLive(deal).valid ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                                  <Calendar className="h-3 w-3" />
                                  {dealExpiryLabel(deal)}
                                </span>
                              )}
                              {deal.startTime && deal.endTime && (
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                  <Clock className="h-2.5 w-2.5" />
                                  {deal.startTime} - {deal.endTime}
                                </p>
                              )}
                            </div>
                          </TableCell>

                          {/* Active Switch */}
                          <TableCell className="text-center">
                            <Switch
                              checked={deal.isActive}
                              disabled={togglingId === deal.id}
                              onCheckedChange={() => handleToggleActive(deal)}
                            />
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => navigate(`/deals/edit/${deal.id}`)}
                                title="Edit Deal"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    title="Delete Deal"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Deal & Combo?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to remove <strong>{deal.name}</strong>? If it has past
                                      sales it will be archived (kept for history) instead of deleted.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(deal.id, deal.name)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

              {/* Pagination */}
              <div className="p-4 border-t">
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
