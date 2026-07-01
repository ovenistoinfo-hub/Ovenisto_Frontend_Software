import { useState } from "react";
import { User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/services/auth.service";
import { toast } from "sonner";

const activityLog = [
  { id: "1", time: "2026-03-08 09:00", action: "Logged in" },
  { id: "2", time: "2026-03-07 18:30", action: "Logged out" },
  { id: "3", time: "2026-03-07 08:45", action: "Logged in" },
  { id: "4", time: "2026-03-06 17:00", action: "Logged out" },
  { id: "5", time: "2026-03-06 09:15", action: "Logged in" },
];

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [email] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [pushAlerts, setPushAlerts] = useState(true);

  const handleSaveProfile = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSavingProfile(true);
    try {
      const updated = await authService.updateProfile({ name: name.trim(), phone: phone.trim() || null });
      updateUser({ name: updated.name, phone: updated.phone });
      toast.success("Profile updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPw) { toast.error("Current password is required"); return; }
    if (newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (newPw !== confirmPw) { toast.error("Passwords don't match"); return; }
    setSavingPw(true);
    try {
      await authService.changePassword(currentPw, newPw);
      toast.success("Password changed successfully");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    } finally {
      setSavingPw(false);
    }
  };

  const CANCEL_AUTHORIZER_ROLES = ["Super Admin", "Admin", "Manager", "Floor Manager"];
  const canSetCancellationPin = CANCEL_AUTHORIZER_ROLES.includes(user?.role || "");

  const handleSetPin = async () => {
    if (!/^\d{4}$/.test(newPin)) { toast.error("PIN must be exactly 4 digits"); return; }
    if (newPin !== confirmPin) { toast.error("PINs don't match"); return; }
    setSavingPin(true);
    try {
      await authService.setPin(newPin);
      toast.success("Cancellation PIN set successfully");
      setNewPin(""); setConfirmPin("");
    } catch (err: any) {
      toast.error(err.message || "Failed to set PIN");
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={<User className="h-5 w-5" />} title="My Profile" subtitle="Account settings" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Personal Info</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="flex justify-center"><div className="h-20 w-20 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">{name.charAt(0)}</div></div>
          <div><label className="text-sm font-medium">Full Name</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="text-sm font-medium">Email</label><Input value={email} disabled className="bg-muted" /></div>
          <div><label className="text-sm font-medium">Phone</label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <Button className="gradient-primary text-primary-foreground" onClick={handleSaveProfile} disabled={savingProfile}>{savingProfile ? "Saving..." : "Save Changes"}</Button>
        </CardContent></Card>
        <div className="space-y-6">
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader><CardContent className="space-y-4">
            <div><label className="text-sm font-medium">Current Password</label><Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></div>
            <div><label className="text-sm font-medium">New Password</label><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
            <div><label className="text-sm font-medium">Confirm Password</label><Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></div>
            <Button variant="outline" onClick={handleUpdatePassword} disabled={savingPw}>{savingPw ? "Updating..." : "Update Password"}</Button>
          </CardContent></Card>
          {canSetCancellationPin && (
            <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Cancellation PIN</CardTitle></CardHeader><CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">This 4-digit PIN is required to authorize order cancellations at the POS.</p>
              <div><label className="text-sm font-medium">New PIN</label><Input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} /></div>
              <div><label className="text-sm font-medium">Confirm PIN</label><Input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} /></div>
              <Button variant="outline" onClick={handleSetPin} disabled={savingPin}>{savingPin ? "Saving..." : "Set PIN"}</Button>
            </CardContent></Card>
          )}
          <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm">Email Alerts</span><Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} /></div>
            <div className="flex items-center justify-between"><span className="text-sm">SMS Alerts</span><Switch checked={smsAlerts} onCheckedChange={setSmsAlerts} /></div>
            <div className="flex items-center justify-between"><span className="text-sm">Push Notifications</span><Switch checked={pushAlerts} onCheckedChange={setPushAlerts} /></div>
          </CardContent></Card>
        </div>
      </div>
      <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Activity Log</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
          <TableBody>{activityLog.map(a => <TableRow key={a.id}><TableCell className="text-muted-foreground">{a.time}</TableCell><TableCell>{a.action}</TableCell></TableRow>)}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
};
export default Profile;
