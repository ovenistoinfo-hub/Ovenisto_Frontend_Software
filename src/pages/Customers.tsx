import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Search, Eye, Plus, Users, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { TablePagination, paginate } from "@/components/TablePagination";

const Customers = () => {
  const navigate = useNavigate();
  const { customers, addItem, removeItem, settings } = useData();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [page, setPage] = useState(1);
  const currency = settings.currency || "Rs.";

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));
  const paged = paginate(filtered, page);

  const handleAdd = () => {
    if (!form.name.trim() || !form.phone.trim()) { toast.error("Name and phone are required"); return; }
    addItem("customers", { id: crypto.randomUUID(), name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(), totalOrders: 0, totalSpent: 0, outstandingDue: 0, lastOrder: "-" });
    setShowAdd(false); setForm({ name: "", phone: "", email: "", address: "" });
    toast.success("Customer added");
  };

  const handleDelete = () => {
    if (deleteId) { removeItem("customers", deleteId); setDeleteId(null); toast.success("Customer deleted"); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title="Customers"
        subtitle="Manage your customers"
        actions={<Button className="gradient-primary text-primary-foreground" onClick={() => setShowAdd(v => !v)}><Plus className="h-4 w-4 mr-2" />Add Customer</Button>}
      />
      {showAdd && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">Add Customer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Name *" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Phone *" value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Address" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleAdd}>Save</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card className="shadow-sm">
        <CardHeader className="pb-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or phone..." className="pl-9" /></div></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12"><Users className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No customers found</p></div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="sticky top-0 z-10 bg-card">SN</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Name</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Phone</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Email</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Orders</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Total Spent</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Due</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((c, i) => (
                    <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>{(page - 1) * 10 + i + 1}</TableCell><TableCell className="font-medium">{c.name}</TableCell><TableCell>{c.phone}</TableCell>
                      <TableCell className="text-muted-foreground">{c.email}</TableCell><TableCell>{c.totalOrders}</TableCell>
                      <TableCell>{currency} {c.totalSpent.toLocaleString()}</TableCell>
                      <TableCell className={c.outstandingDue > 0 ? "text-destructive font-medium" : "text-success"}>{currency} {c.outstandingDue.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/customers/${c.id}`)}><Eye className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Customer?</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete this customer? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Customers;
