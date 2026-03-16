import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Clock, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { PageHeader } from "@/components/ui/page-header";

const statusColors: Record<string, string> = { present: "bg-success/10 text-success", absent: "bg-destructive/10 text-destructive", late: "bg-warning/10 text-warning" };
const dotColors: Record<string, string> = { present: "bg-success", absent: "bg-destructive", late: "bg-warning" };

const Attendance = () => {
  const { attendance: attendanceList, users, addItem, updateItem } = useData();
  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const today = new Date().toISOString().split("T")[0];
  const myRecord = attendanceList.find(a => a.date === today && a.employee === "Admin User");
  const clockedIn = myRecord && myRecord.clockIn && !myRecord.clockOut;

  const handleClock = () => {
    if (!clockedIn) {
      if (myRecord) { updateItem("attendance", myRecord.id, { clockIn: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }), status: "present" }); }
      else { addItem("attendance", { id: crypto.randomUUID(), employee: "Admin User", role: "Super Admin", date: today, clockIn: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }), clockOut: "", totalHours: 0, status: "present" as const }); }
      toast.success("Clocked in at " + new Date().toLocaleTimeString());
    } else {
      const clockOut = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
      const clockInParts = myRecord!.clockIn.split(":");
      const now = new Date();
      const hours = Math.round((now.getHours() - parseInt(clockInParts[0]) + (now.getMinutes() - parseInt(clockInParts[1])) / 60) * 10) / 10;
      updateItem("attendance", myRecord!.id, { clockOut, totalHours: Math.max(0, hours) });
      toast.success(`Clocked out! Total hours: ${Math.max(0, hours)}`);
    }
  };

  const selectedDate = date ? date.toISOString().split("T")[0] : today;
  const dayAttendance = attendanceList.filter(a => a.date === selectedDate);

  const monthlyData: Record<string, Record<number, "present" | "absent" | "late">> = {};
  const daysInMonth = 8;
  users.forEach((u) => {
    monthlyData[u.name] = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `2026-03-${String(d).padStart(2, "0")}`;
      const rec = attendanceList.find(a => a.employee === u.name && a.date === dateStr);
      if (rec) monthlyData[u.name][d] = rec.status as "present" | "absent" | "late";
      else monthlyData[u.name][d] = d <= new Date().getDate() ? "absent" : "present";
    }
  });

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<Clock className="h-5 w-5" />} title="Attendance" subtitle="Staff attendance" actions={
        <div className="flex items-center gap-3">
          <div className="flex border rounded-lg overflow-hidden"><Button variant={view === "daily" ? "default" : "ghost"} size="sm" onClick={() => setView("daily")} className={view === "daily" ? "gradient-primary text-primary-foreground" : ""}>Daily</Button><Button variant={view === "monthly" ? "default" : "ghost"} size="sm" onClick={() => setView("monthly")} className={view === "monthly" ? "gradient-primary text-primary-foreground" : ""}>Monthly</Button></div>
          <Button className={cn("text-lg px-8 py-6", clockedIn ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "gradient-primary text-primary-foreground")} onClick={handleClock}><Clock className="h-5 w-5 mr-2" />{clockedIn ? "Clock Out" : "Clock In"}</Button>
        </div>
      } />
      {clockedIn && myRecord && <Card className="shadow-sm border-success/30"><CardContent className="p-4 flex items-center gap-3"><Clock className="h-5 w-5 text-success" /><span className="text-sm">Clocked in at <strong>{myRecord.clockIn}</strong></span></CardContent></Card>}
      {view === "daily" ? (
        <div className="space-y-4">
          <Popover><PopoverTrigger asChild><Button variant="outline" size="sm"><CalendarDays className="h-4 w-4 mr-2" />{date ? format(date, "PPP") : "Pick date"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={date} onSelect={setDate} className="p-3 pointer-events-auto" /></PopoverContent></Popover>
          <Card className="shadow-sm"><CardContent className="pt-6">
            <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>SN</TableHead><TableHead>Employee</TableHead><TableHead>Role</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead><TableHead>Hours</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{dayAttendance.length > 0 ? dayAttendance.map((a, i) => (<TableRow key={a.id} className="hover:bg-muted/30 transition-colors"><TableCell>{i+1}</TableCell><TableCell className="font-medium">{a.employee}</TableCell><TableCell>{a.role}</TableCell><TableCell>{a.clockIn || "—"}</TableCell><TableCell>{a.clockOut || "—"}</TableCell><TableCell>{a.totalHours || "—"}</TableCell><TableCell><Badge variant="secondary" className={statusColors[a.status]}>{a.status}</Badge></TableCell></TableRow>)) : (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No attendance records for this date</TableCell></TableRow>
              )}</TableBody></Table></div>
          </CardContent></Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}><SelectTrigger className="max-w-xs"><SelectValue placeholder="All employees" /></SelectTrigger><SelectContent><SelectItem value="all">All Employees</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent></Select>
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">March 2026</CardTitle></CardHeader><CardContent>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead className="font-medium">Employee</TableHead>{Array.from({length:daysInMonth},(_,d)=><TableHead key={d} className="text-center font-medium w-10">Mar {d+1}</TableHead>)}<TableHead className="text-center font-medium">Present</TableHead><TableHead className="text-center font-medium">Absent</TableHead><TableHead className="text-center font-medium">Late</TableHead></TableRow></TableHeader>
              <TableBody>{Object.entries(monthlyData).filter(([name]) => selectedEmployee === "all" || name === selectedEmployee).map(([name, days]) => { const present = Object.values(days).filter(s => s === "present").length; const absent = Object.values(days).filter(s => s === "absent").length; const late = Object.values(days).filter(s => s === "late").length; return (<TableRow key={name} className="hover:bg-muted/30 transition-colors"><TableCell className="font-medium">{name}</TableCell>{Array.from({length:daysInMonth},(_,d)=><TableCell key={d} className="text-center"><div className={cn("h-3 w-3 rounded-full mx-auto", dotColors[days[d+1] || "present"])} title={days[d+1]} /></TableCell>)}<TableCell className="text-center text-success font-medium">{present}</TableCell><TableCell className="text-center text-destructive font-medium">{absent}</TableCell><TableCell className="text-center text-warning font-medium">{late}</TableCell></TableRow>); })}</TableBody></Table></div>
            <div className="flex gap-4 mt-4 text-xs"><span className="flex items-center gap-1"><div className="h-3 w-3 rounded-full bg-success" /> Present</span><span className="flex items-center gap-1"><div className="h-3 w-3 rounded-full bg-destructive" /> Absent</span><span className="flex items-center gap-1"><div className="h-3 w-3 rounded-full bg-warning" /> Late</span></div>
          </CardContent></Card>
        </div>
      )}
    </div>
  );
};
export default Attendance;
