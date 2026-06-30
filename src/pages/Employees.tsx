import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { employeeService, type EmployeeRecord } from "@/services/employee.service";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Plus, Search, Pencil, IdCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { useAuth } from "@/contexts/AuthContext";

const Employees = () => {
  const { user } = useAuth();
  const canManage = ["Super Admin", "Admin", "Manager", "Store Manager"].includes(user?.role ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(1);

  const { data: list = [], isLoading: loading } = useQuery({
    queryKey: ["employees", statusFilter],
    queryFn: () => employeeService.getAll({ limit: 200, status: statusFilter === "all" ? undefined : statusFilter }).then(r => r.data),
  });

  const filtered = list.filter(e => {
    const name = `${e.firstName} ${e.lastName ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase()) ||
      (e.division ?? "").toLowerCase().includes(search.toLowerCase());
  });
  const paged = paginate(filtered, page);

  const initials = (e: EmployeeRecord) => `${e.firstName[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase();

  if (loading) return <div className="space-y-6"><div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-32" /></div><Card className="shadow-sm"><CardContent className="pt-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IdCard className="h-5 w-5" />}
        title="Employees"
        subtitle={`${list.length} employee records`}
        actions={canManage ? <Button className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" />Add Employee</Button> : undefined}
      />

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, designation, division..." className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <IdCard className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">No employees found</p>
              {canManage && <Button size="sm" className="gradient-primary text-primary-foreground mt-3"><Plus className="h-4 w-4 mr-1" />Add Employee</Button>}
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Photo</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Division</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Hire Date</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>{paged.map(e => (
                    <TableRow key={e.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={e.photoUrl ?? undefined} />
                          <AvatarFallback className="text-xs">{initials(e)}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{e.firstName} {e.lastName ?? ""}</TableCell>
                      <TableCell>{e.designation}</TableCell>
                      <TableCell>{e.division ?? "—"}</TableCell>
                      <TableCell>{e.phone}</TableCell>
                      <TableCell>{new Date(e.hireDate).toLocaleDateString("en-PK")}</TableCell>
                      <TableCell>{e.supervisor ? `${e.supervisor.firstName} ${e.supervisor.lastName ?? ""}` : "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className={e.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>{e.status}</Badge></TableCell>
                      {canManage && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
                        </TableCell>
                      )}
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
export default Employees;
