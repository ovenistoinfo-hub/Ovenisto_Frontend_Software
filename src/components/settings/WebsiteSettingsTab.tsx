import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { settingsService } from "@/services/settings.service";
import { parseWebsiteConfig, buildWebsiteConfig, WebsiteConfig } from "@/lib/websiteConfig";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function WebsiteSettingsTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rawConfig, setRawConfig] = useState<unknown>(null);
  const [onlineOrdersGlobally, setOnlineOrdersGlobally] = useState(false);

  const [form, setForm] = useState<WebsiteConfig>({
    enabled: false,
    reservationsEnabled: false,
    deliveryFee: 0,
    freeDeliveryAbove: null,
    minOrder: 0,
    prepTimeMinutes: 30,
  });

  const [freeDeliveryStr, setFreeDeliveryStr] = useState("");
  const [deliveryFeeStr, setDeliveryFeeStr] = useState("0");
  const [minOrderStr, setMinOrderStr] = useState("0");
  const [prepTimeStr, setPrepTimeStr] = useState("30");

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const res = await settingsService.getMySettings();
      if (res) {
        setOnlineOrdersGlobally(res.onlineOrders ?? true);
        setRawConfig(res.websiteConfig);
        const parsed = parseWebsiteConfig(res.websiteConfig);
        setForm(parsed);
        setFreeDeliveryStr(parsed.freeDeliveryAbove !== null ? String(parsed.freeDeliveryAbove) : "");
        setDeliveryFeeStr(String(parsed.deliveryFee));
        setMinOrderStr(String(parsed.minOrder));
        setPrepTimeStr(String(parsed.prepTimeMinutes));
      }
    } catch (err: any) {
      setLoadFailed(true);
      toast.error(err.message || "Failed to load website settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const dFee = Number(deliveryFeeStr);
    const mOrder = Number(minOrderStr);
    const pTime = Number(prepTimeStr);
    const fdAbove = freeDeliveryStr.trim() === "" ? null : Number(freeDeliveryStr);

    if (isNaN(dFee) || dFee < 0) return toast.error("Invalid delivery fee");
    if (isNaN(mOrder) || mOrder < 0) return toast.error("Invalid minimum order");
    if (isNaN(pTime) || pTime < 1 || pTime > 180) return toast.error("Prep time must be between 1 and 180 minutes");
    if (fdAbove !== null && (isNaN(fdAbove) || fdAbove < 0)) return toast.error("Invalid free delivery threshold");

    const finalForm: WebsiteConfig = {
      ...form,
      deliveryFee: dFee,
      minOrder: mOrder,
      prepTimeMinutes: pTime,
      freeDeliveryAbove: fdAbove,
    };

    const payload = buildWebsiteConfig(rawConfig, finalForm);

    setSaving(true);
    try {
      await settingsService.updateSettings({ websiteConfig: payload });
      toast.success("Website settings updated");
      setRawConfig(payload);
    } catch (err: any) {
      toast.error(err.message || "Failed to update website settings");
    } finally {
      setSaving(false);
    }
  };

  const isSuperAdmin = !user?.outletId;
  const isDisabled = isSuperAdmin || loadFailed;

  if (loading) return <div className="p-4 text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="space-y-4 max-w-2xl">
      {loadFailed && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Could not load this branch's website settings — reload the page.
          </AlertDescription>
        </Alert>
      )}

      {isSuperAdmin && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Cannot Edit</AlertTitle>
          <AlertDescription>
            Website settings are per branch — sign in as that branch's Admin or Manager to change them.
          </AlertDescription>
        </Alert>
      )}

      {!onlineOrdersGlobally && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Note</AlertTitle>
          <AlertDescription>
            Online orders are switched off in General — website ordering stays closed until you switch them on.
          </AlertDescription>
        </Alert>
      )}

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Website Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Accept website orders</label>
              <p className="text-xs text-muted-foreground">Allow customers to place orders online</p>
            </div>
            <Switch
              disabled={isDisabled}
              checked={form.enabled}
              onCheckedChange={(c) => setForm({ ...form, enabled: c })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Accept website reservations</label>
              <p className="text-xs text-muted-foreground">Allow customers to book tables online</p>
            </div>
            <Switch
              disabled={isDisabled}
              checked={form.reservationsEnabled}
              onCheckedChange={(c) => setForm({ ...form, reservationsEnabled: c })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <label className="text-sm font-medium">Delivery fee (Rs)</label>
              <Input
                type="number"
                disabled={isDisabled}
                min="0"
                value={deliveryFeeStr}
                onChange={(e) => setDeliveryFeeStr(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Free delivery above (Rs)</label>
              <Input
                type="number"
                disabled={isDisabled}
                min="0"
                placeholder="Leave empty for never"
                value={freeDeliveryStr}
                onChange={(e) => setFreeDeliveryStr(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Minimum order for delivery (Rs)</label>
              <Input
                type="number"
                disabled={isDisabled}
                min="0"
                value={minOrderStr}
                onChange={(e) => setMinOrderStr(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Prep time (minutes)</label>
              <Input
                type="number"
                disabled={isDisabled}
                min="1"
                max="180"
                value={prepTimeStr}
                onChange={(e) => setPrepTimeStr(e.target.value)}
              />
            </div>
          </div>

          <Button disabled={isDisabled || saving} onClick={handleSave} className="w-full sm:w-auto">
            {saving ? "Saving..." : "Save Website Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
