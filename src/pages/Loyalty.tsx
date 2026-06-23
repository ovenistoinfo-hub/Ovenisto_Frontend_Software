import { useState } from "react";
import { Award, Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { useData } from "@/contexts/DataContext";
import { toast } from "sonner";

const tierColors: Record<string, string> = { Bronze: "bg-warning/10 text-warning", Silver: "bg-muted text-muted-foreground", Gold: "bg-gold/10 text-gold", Platinum: "bg-primary/10 text-primary" };

const Loyalty = () => {
  const { loyaltySettings, loyaltyMembers, loyaltyRewards, loyaltyTransactions, addItem, updateItem, removeItem, updateLoyaltySettings } = useData();
  const [tab, setTab] = useState("members");
  const [showRewardDialog, setShowRewardDialog] = useState(false);
  const [editRewardId, setEditRewardId] = useState<string | null>(null);
  const [deleteRewardId, setDeleteRewardId] = useState<string | null>(null);
  const [rewardForm, setRewardForm] = useState<{ name: string; pointsRequired: number; type: "freeItem" | "percentDiscount" | "fixedDiscount"; value: string; isActive: boolean }>({ name: "", pointsRequired: 100, type: "freeItem", value: "", isActive: true });

  const [earnSettings, setEarnSettings] = useState({ amountPerPoint: loyaltySettings.amountPerPoint, pointsPerAmount: loyaltySettings.pointsPerAmount, signupBonus: loyaltySettings.signupBonus, birthdayBonus: loyaltySettings.birthdayBonus });

  const totalMembers = loyaltyMembers.length;
  const activeMembers = loyaltyMembers.filter(m => m.availablePoints > 0).length;
  const totalEarned = loyaltyTransactions.filter(t => t.type === "earn").reduce((s, t) => s + t.points, 0);
  const todayRedeemed = loyaltyTransactions.filter(t => t.type === "redeem" && t.date === new Date().toISOString().split("T")[0]).reduce((s, t) => s + t.points, 0);

  const openAddReward = () => { setEditRewardId(null); setRewardForm({ name: "", pointsRequired: 100, type: "freeItem", value: "", isActive: true }); setShowRewardDialog(true); };
  const openEditReward = (r: typeof loyaltyRewards[0]) => { setEditRewardId(r.id); setRewardForm({ name: r.name, pointsRequired: r.pointsRequired, type: r.type, value: r.value, isActive: r.isActive }); setShowRewardDialog(true); };

  const saveReward = () => {
    if (!rewardForm.name.trim()) { toast.error("Reward name required"); return; }
    if (editRewardId) { updateItem("loyaltyRewards", editRewardId, rewardForm); toast.success("Updated"); }
    else { addItem("loyaltyRewards", { id: crypto.randomUUID(), ...rewardForm }); toast.success("Reward added"); }
    setShowRewardDialog(false);
  };

  const saveEarnSettings = () => { updateLoyaltySettings(earnSettings); toast.success("Settings saved"); };

  return (
    <div className="space-y-6">
      <PageHeader icon={<Award className="h-5 w-5" />} title="Loyalty Program" subtitle="Reward your regular customers" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Total Members</p><p className="text-2xl font-bold">{totalMembers}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Active Members</p><p className="text-2xl font-bold">{activeMembers}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Points Earned</p><p className="text-2xl font-bold">{totalEarned.toLocaleString()}</p></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Redeemed Today</p><p className="text-2xl font-bold">{todayRedeemed.toLocaleString()}</p></CardContent></Card>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto -mx-4 px-4"><TabsList className="w-max"><TabsTrigger value="members">Members</TabsTrigger><TabsTrigger value="rules">Earn Rules</TabsTrigger><TabsTrigger value="rewards">Rewards</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList></div>
        <TabsContent value="members">
          <Card className="shadow-sm"><CardContent className="pt-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Customer</TableHead><TableHead>Phone</TableHead><TableHead>Points</TableHead><TableHead>Available</TableHead><TableHead>Tier</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
            <TableBody>{loyaltyMembers.map(m => (<TableRow key={m.id} className="hover:bg-muted/30 transition-colors"><TableCell className="font-medium">{m.customerName}</TableCell><TableCell>{m.phone}</TableCell><TableCell>{m.totalPoints}</TableCell><TableCell className="font-medium">{m.availablePoints}</TableCell><TableCell><Badge variant="secondary" className={tierColors[m.tier] || ""}>{m.tier}</Badge></TableCell><TableCell className="text-xs">{m.joinedDate}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
        </TabsContent>
        <TabsContent value="rules">
           <Card className="shadow-sm"><CardContent className="pt-4 space-y-4">
            <div className="flex items-center gap-2 text-sm flex-wrap"><span>Rs.</span><Input type="number" value={earnSettings.amountPerPoint} onChange={e => setEarnSettings(p => ({ ...p, amountPerPoint: Number(e.target.value) }))} className="w-20" /><span>spent = </span><Input type="number" value={earnSettings.pointsPerAmount} onChange={e => setEarnSettings(p => ({ ...p, pointsPerAmount: Number(e.target.value) }))} className="w-20" /><span>point(s)</span></div>
            <div className="flex items-center gap-2 text-sm flex-wrap"><span>Signup Bonus:</span><Input type="number" value={earnSettings.signupBonus} onChange={e => setEarnSettings(p => ({ ...p, signupBonus: Number(e.target.value) }))} className="w-20" /><span>points</span></div>
            <div className="flex items-center gap-2 text-sm flex-wrap"><span>Birthday Bonus:</span><Input type="number" value={earnSettings.birthdayBonus} onChange={e => setEarnSettings(p => ({ ...p, birthdayBonus: Number(e.target.value) }))} className="w-20" /><span>points</span></div>
            <div className="pt-2"><h4 className="text-sm font-medium mb-2">Tiers</h4><div className="space-y-1">{loyaltySettings.tiers.map(t => (<div key={t.name} className="flex items-center gap-3 text-sm flex-wrap"><Badge variant="secondary" className={tierColors[t.name] || ""}>{t.name}</Badge><span>{t.minPoints}+ pts</span><span className="text-muted-foreground">×{t.multiplier} multiplier</span></div>))}</div></div>
            <Button className="gradient-primary text-primary-foreground" onClick={saveEarnSettings}>Save Rules</Button>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="rewards">
          <Card className="shadow-sm"><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Rewards</CardTitle><Button size="sm" className="gradient-primary text-primary-foreground" onClick={openAddReward}><Plus className="h-4 w-4 mr-1" />Add Reward</Button></CardHeader><CardContent>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Reward</TableHead><TableHead>Points</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>{loyaltyRewards.map(r => (<TableRow key={r.id} className="hover:bg-muted/30 transition-colors"><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.pointsRequired}</TableCell><TableCell className="capitalize">{r.type}</TableCell><TableCell><Badge variant="secondary" className={r.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{r.isActive ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditReward(r)}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteRewardId(r.id)}><Trash2 className="h-3 w-3" /></Button></div></TableCell></TableRow>))}</TableBody></Table></div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="history">
          <Card className="shadow-sm"><CardContent className="pt-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50"><TableHead>Date</TableHead><TableHead>Member</TableHead><TableHead>Type</TableHead><TableHead>Points</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
            <TableBody>{loyaltyTransactions.map(t => { const member = loyaltyMembers.find(m => m.id === t.memberId); return (<TableRow key={t.id} className="hover:bg-muted/30 transition-colors"><TableCell className="text-xs">{t.date}</TableCell><TableCell className="font-medium">{member?.customerName || "—"}</TableCell><TableCell><Badge variant="secondary" className={t.type === "earn" ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}>{t.type}</Badge></TableCell><TableCell className={t.type === "earn" ? "text-success" : "text-primary"}>{ t.type === "earn" ? "+" : "-"}{t.points}</TableCell><TableCell className="text-sm">{t.description}</TableCell></TableRow>); })}</TableBody></Table></div></CardContent></Card>
        </TabsContent>
      </Tabs>
      {showRewardDialog && (
        <Card className="shadow-sm border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">{editRewardId ? "Edit" : "Add"} Reward</CardTitle></CardHeader>
          <CardContent className="space-y-3"><div><Label>Reward Name</Label><Input value={rewardForm.name} onChange={e => setRewardForm(p => ({ ...p, name: e.target.value }))} /></div><div><Label>Points Required</Label><Input type="number" value={rewardForm.pointsRequired} onChange={e => setRewardForm(p => ({ ...p, pointsRequired: Number(e.target.value) }))} /></div><div><Label>Type</Label><Select value={rewardForm.type} onValueChange={v => setRewardForm(p => ({ ...p, type: v as any }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="freeItem">Free Item</SelectItem><SelectItem value="percentDiscount">% Discount</SelectItem><SelectItem value="fixedDiscount">Fixed Discount</SelectItem></SelectContent></Select></div><div><Label>Value</Label><Input value={rewardForm.value} onChange={e => setRewardForm(p => ({ ...p, value: e.target.value }))} placeholder="Item name, %, or amount" /></div><div className="flex items-center justify-between"><Label>Active</Label><Switch checked={rewardForm.isActive} onCheckedChange={c => setRewardForm(p => ({ ...p, isActive: c }))} /></div>
        <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setShowRewardDialog(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground" onClick={saveReward}>Save</Button></div>
        </CardContent>
      </Card>
      )}
      <AlertDialog open={!!deleteRewardId} onOpenChange={() => setDeleteRewardId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Reward?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteRewardId) { removeItem("loyaltyRewards", deleteRewardId); setDeleteRewardId(null); toast.success("Deleted"); } }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
};
export default Loyalty;
