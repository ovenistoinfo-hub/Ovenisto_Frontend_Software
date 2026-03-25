import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Utensils, Timer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { menuService, type MenuItemRecord, type CategoryRecord } from "@/services/menu.service";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";

const FoodMenu = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<MenuItemRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [page, setPage] = useState(1);

  const fetchAll = useCallback(async () => {
    try {
      const [menuItems, cats] = await Promise.all([
        menuService.getMenuItems({ limit: 500 }),
        menuService.getCategories(),
      ]);
      setItems(menuItems);
      setCategories(cats);
    } catch (err: any) {
      toast.error(err.message || "Failed to load menu items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = items.filter((i) =>
    (catFilter === "All" || i.category?.name === catFilter) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleAvailable = async (item: MenuItemRecord) => {
    try {
      await menuService.updateMenuItem(item.id, { available: !item.available });
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, available: !item.available } : i));
    } catch (err: any) {
      toast.error(err.message || "Failed to update availability");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await menuService.deleteMenuItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete item");
    }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Utensils className="h-5 w-5" />} title="Food Menu" subtitle="Manage menu items" />
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-sm flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu..." className="pl-9" /></div>
            <div className="flex gap-1 flex-wrap">
              <Button key="All" variant={catFilter === "All" ? "default" : "outline"} size="sm" onClick={() => setCatFilter("All")} className={catFilter === "All" ? "gradient-primary text-primary-foreground" : ""}>All</Button>
              {categories.map((c) => (<Button key={c.id} variant={catFilter === c.name ? "default" : "outline"} size="sm" onClick={() => setCatFilter(c.name)} className={catFilter === c.name ? "gradient-primary text-primary-foreground" : ""}>{c.name}</Button>))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12"><Utensils className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No food items found</p><p className="text-xs text-muted-foreground mt-1.5">Add your first menu item to get started.</p><Button size="sm" className="gradient-primary text-primary-foreground mt-3" onClick={() => navigate("/items/food-menu/add")}><Plus className="h-4 w-4 mr-1" />Add Food Item</Button></div>
          ) : (
            <>
            <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead>Code</TableHead><TableHead>Price</TableHead><TableHead>Cooking Time</TableHead><TableHead>Available</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>{paginate(filtered, page).map((item, i) => (
                  <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>{(page - 1) * 10 + i + 1}</TableCell>
                    <TableCell><div className="flex items-center gap-2">{item.image ? (<img src={item.image} alt={item.name} className="h-8 w-8 rounded-md object-cover shrink-0" />) : (<div className="h-8 w-8 rounded-md gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">{item.name.charAt(0)}</div>)}<span className="font-medium">{item.name}</span></div></TableCell>
                    <TableCell><Badge variant="secondary">{item.category?.name || "—"}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{item.code || "—"}</TableCell>
                    <TableCell className="font-medium">Rs. {item.price}</TableCell>
                    <TableCell>{item.cookingTime > 0 ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Timer className="h-3 w-3" />{item.cookingTime} min</span> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Switch checked={item.available} onCheckedChange={() => toggleAvailable(item)} /></TableCell>
                    <TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/items/food-menu/edit/${item.id}`)}><Pencil className="h-3 w-3" /></Button>
                      <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {item.name}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                    </div></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
            <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FoodMenu;
