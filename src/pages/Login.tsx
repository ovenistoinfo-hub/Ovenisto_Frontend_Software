import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Returns the default landing page for each role
function getDefaultRouteForRole(role?: string): string {
  switch (role) {
    case 'Waiter':           return '/waiter';
    case 'Kitchen Staff':    return '/kitchens';
    case 'Kitchen Manager':  return '/kitchens';
    case 'Cashier':          return '/pos';
    case 'Delivery Manager': return '/delivery';
    case 'Store Manager':    return '/stock';
    case 'Accountant':       return '/sales';
    case 'Rider':            return '/my-portal';
    case 'Customer Screen':  return '/customer-display';
    default:                 return '/';
  }
}

const Login = () => {
  const [email, setEmail] = useState("admin@ovenisto.com");
  const [password, setPassword] = useState("password123");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { toast.error("Email and password are required"); return; }
    localStorage.setItem("ovenisto_remember", remember ? "true" : "false");
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) {
      toast.success("Welcome back!");
      // Read the stored user to get their role for navigation
      const stored = localStorage.getItem("ovenisto_user");
      const userData = stored ? JSON.parse(stored) : null;
      navigate(getDefaultRouteForRole(userData?.role));
    }
    else { toast.error("Invalid email or password"); }
  };

  const handleForgotPassword = () => {
    if (!forgotEmail.trim()) { toast.error("Please enter your email"); return; }
    toast.success(`Password reset link sent to ${forgotEmail}`);
    setShowForgot(false);
    setForgotEmail("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle at 25% 25%, hsl(var(--primary)) 0%, transparent 50%), radial-gradient(circle at 75% 75%, hsl(var(--accent)) 0%, transparent 50%)" }} />
      <Card className="w-full max-w-md mx-4 shadow-lg border-border relative z-10 animate-login-card">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Flame className="h-10 w-10 text-primary" />
              <span className="text-3xl font-bold text-primary">Ovenisto</span>
            </div>
            <p className="text-muted-foreground text-sm">Restaurant Management System</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" required />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Password</label>
              <div className="relative">
                <Input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox id="remember" checked={remember} onCheckedChange={(c) => setRemember(!!c)} />
                <label htmlFor="remember" className="text-sm text-muted-foreground">Remember me</label>
              </div>
              <button type="button" className="text-sm text-primary hover:underline" onClick={() => setShowForgot(true)}>Forgot password?</button>
            </div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground font-semibold h-11" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="text-center text-[10px] text-muted-foreground mt-8">Version 8.0</p>
        </CardContent>
      </Card>
      <Dialog open={showForgot} onOpenChange={setShowForgot}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter your email address to receive a password reset link.</p>
            <Input type="email" placeholder="Enter your email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForgot(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={handleForgotPassword}>Send Reset Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
