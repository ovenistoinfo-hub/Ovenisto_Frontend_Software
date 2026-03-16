import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { PageHeader } from "@/components/ui/page-header";

const templates = [
  { id: "1", name: "Weekend Offer", text: "🍕 50% OFF on all Pizzas this weekend! Visit Ovenisto now." },
  { id: "2", name: "Order Ready", text: "Your order #{orderNumber} is ready for pickup!" },
  { id: "3", name: "Birthday", text: "Happy Birthday! Get 20% off on your next order at Ovenisto 🎂" },
  { id: "4", name: "Custom", text: "" },
];

const SMS = () => {
  const { smsHistory, customers, addItem } = useData();
  const [message, setMessage] = useState("");
  const [recipientType, setRecipientType] = useState("all");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [schedule, setSchedule] = useState(false);
  const [template, setTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const toggleCustomer = (id: string) => setSelectedCustomers(p => p.includes(id) ? p.filter(c => c !== id) : [...p, id]);
  const handleTemplateChange = (id: string) => { setTemplate(id); const t = templates.find(t => t.id === id); if (t && t.text) setMessage(t.text); };
  const recipientCount = recipientType === "all" ? customers.length : recipientType === "specific" ? selectedCustomers.length : customers.filter(c => c.outstandingDue > 0).length;

  const handleSend = () => {
    addItem("smsHistory", { id: crypto.randomUUID(), date: new Date().toISOString().split("T")[0], recipientCount, message, status: "sent", cost: recipientCount * 2 });
    toast.success(`SMS ${schedule ? "scheduled" : "sent"} to ${recipientCount} customers!`);
    setMessage("");
  };

  if (loading) return <div className="space-y-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div><Skeleton className="h-10 w-full rounded-lg" />{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg mt-2" />)}</div>;

  return (
    <div className="space-y-6">
      <PageHeader icon={<MessageSquare className="h-5 w-5" />} title="SMS" subtitle="Messaging center" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Recipients</CardTitle></CardHeader><CardContent className="space-y-3">
            <RadioGroup value={recipientType} onValueChange={setRecipientType}>
              <div className="flex items-center gap-2"><RadioGroupItem value="all" id="all" /><Label htmlFor="all">All Customers ({customers.length})</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="specific" id="specific" /><Label htmlFor="specific">Select Specific</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="dues" id="dues" /><Label htmlFor="dues">Customers with Dues ({customers.filter(c=>c.outstandingDue>0).length})</Label></div>
            </RadioGroup>
            {recipientType === "specific" && (<div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">{customers.map(c => (<label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer"><Checkbox checked={selectedCustomers.includes(c.id)} onCheckedChange={() => toggleCustomer(c.id)} />{c.name} — {c.phone}</label>))}<p className="text-xs text-muted-foreground mt-2">{selectedCustomers.length} of {customers.length} selected</p></div>)}
          </CardContent></Card>
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Compose Message</CardTitle></CardHeader><CardContent className="space-y-3">
            <Select value={template} onValueChange={handleTemplateChange}><SelectTrigger><SelectValue placeholder="Select template..." /></SelectTrigger><SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
            <Textarea placeholder="Type your message..." value={message} onChange={(e) => setMessage(e.target.value)} rows={4} /><p className="text-xs text-muted-foreground">{message.length}/160 characters</p>
            <div className="flex items-center gap-3"><Switch checked={schedule} onCheckedChange={setSchedule} /><span className="text-sm">{schedule ? "Schedule" : "Send Now"}</span></div>
            {schedule && (<div className="grid grid-cols-2 gap-2"><Input type="date" defaultValue="2026-03-10" /><Input type="time" defaultValue="10:00" /></div>)}
            <Button className="gradient-primary text-primary-foreground w-full" onClick={handleSend}><Send className="h-4 w-4 mr-2" />{schedule ? "Schedule SMS" : `Send to ${recipientCount} Customers`}</Button>
          </CardContent></Card>
        </div>
        <div className="space-y-4">
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader><CardContent><div className="bg-muted rounded-lg p-4 max-w-xs mx-auto"><div className="bg-card rounded-lg p-3 shadow-sm"><p className="text-xs text-muted-foreground mb-1">From: Ovenisto</p><p className="text-sm">{message || "Your message will appear here..."}</p></div></div></CardContent></Card>
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">SMS History</CardTitle></CardHeader><CardContent>
            {smsHistory.length === 0 ? (<div className="text-center py-8"><MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" /><p className="text-muted-foreground">No messages sent yet</p></div>) : (
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-500px)]"><Table><TableHeader className="sticky top-0 z-10 bg-card"><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Date</TableHead><TableHead>Recipients</TableHead><TableHead>Message</TableHead><TableHead>Status</TableHead><TableHead>Cost</TableHead></TableRow></TableHeader>
                <TableBody>{smsHistory.map((s) => (<TableRow key={s.id} className="hover:bg-muted/30 transition-colors"><TableCell>{s.date}</TableCell><TableCell>{s.recipientCount}</TableCell><TableCell className="max-w-xs truncate">{s.message}</TableCell><TableCell><Badge variant="secondary" className="bg-success/10 text-success">{s.status}</Badge></TableCell><TableCell>Rs. {s.cost}</TableCell></TableRow>))}</TableBody></Table></div>
            )}
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
};
export default SMS;
