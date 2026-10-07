import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { settingsService } from "@/services/settings.service";
import { parseWebsiteConfig, buildWebsiteConfig, WebsiteConfig, parseMapsLink } from "@/lib/websiteConfig";
import { MapPin, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
    location: null,
  });

  const [freeDeliveryStr, setFreeDeliveryStr] = useState("");
  const [deliveryFeeStr, setDeliveryFeeStr] = useState("0");
  const [minOrderStr, setMinOrderStr] = useState("0");
  const [prepTimeStr, setPrepTimeStr] = useState("30");
  const [latStr, setLatStr] = useState("");
  const [lngStr, setLngStr] = useState("");
  const [mapsLinkStr, setMapsLinkStr] = useState("");
  const [isLocating, setIsLocating] = useState(false);

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
        setLatStr(parsed.location ? String(parsed.location.lat) : "");
        setLngStr(parsed.location ? String(parsed.location.lng) : "");
      }
    } catch (err: unknown) {
      setLoadFailed(true);
      toast.error(err instanceof Error ? err.message : "Failed to load website settings");
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

    let finalLocation = null;
    const lStr = latStr.trim();
    const lnStr = lngStr.trim();
    if (lStr === "" && lnStr === "") {
      finalLocation = null;
    } else if (lStr === "" || lnStr === "") {
      toast.error("Enter a valid latitude and longitude, or clear both");
      return;
    } else {
      const lat = Number(lStr);
      const lng = Number(lnStr);
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
        toast.error("Enter a valid latitude and longitude, or clear both");
        return;
      }
      finalLocation = { lat, lng };
    }

    const finalForm: WebsiteConfig = {
      ...form,
      deliveryFee: dFee,
      minOrder: mOrder,
      prepTimeMinutes: pTime,
      freeDeliveryAbove: fdAbove,
      location: finalLocation,
    };

    const payload = buildWebsiteConfig(rawConfig, finalForm);

    setSaving(true);
    try {
      await settingsService.updateSettings({ websiteConfig: payload });
      toast.success("Website settings updated");
      setRawConfig(payload);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update website settings");
    } finally {
      setSaving(false);
    }
  };

  const handleApplyLink = () => {
    const res = parseMapsLink(mapsLinkStr);
    if (res.ok) {
      setLatStr(String(res.lat));
      setLngStr(String(res.lng));
      setMapsLinkStr("");
    } else if (!res.ok && 'reason' in res && res.reason === 'short_link') {
      toast.error("Short links can't be read here — open it in your browser and paste the full link from the address bar, or paste the coordinates.");
    } else {
      toast.error("Could not find coordinates in this link");
    }
  };

  const handleDeviceLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatStr(String(pos.coords.latitude));
        setLngStr(String(pos.coords.longitude));
        setIsLocating(false);
      },
      (err) => {
        toast.error("Could not get location: " + err.message);
        setIsLocating(false);
      },
      { timeout: 8000, enableHighAccuracy: false, maximumAge: 600000 }
    );
  };

  const isSuperAdmin = !user?.outletId || user?.role === "Super Admin";
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

          <div className="pt-4 border-t space-y-4">
            <h3 className="text-lg font-semibold flex items-center">
              <MapPin className="mr-2 h-5 w-5" />
              Branch location
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Latitude</label>
                <Input
                  disabled={isDisabled}
                  placeholder="e.g. 31.47"
                  value={latStr}
                  onChange={(e) => setLatStr(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Longitude</label>
                <Input
                  disabled={isDisabled}
                  placeholder="e.g. 74.30"
                  value={lngStr}
                  onChange={(e) => setLngStr(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <label className="text-sm font-medium">Paste a Google Maps link or coordinates</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    disabled={isDisabled}
                    placeholder="Paste here..."
                    value={mapsLinkStr}
                    onChange={(e) => setMapsLinkStr(e.target.value)}
                  />
                  <Button disabled={isDisabled || !mapsLinkStr} onClick={handleApplyLink} variant="secondary">
                    Apply
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
              <div className="flex-1">
                <Button disabled={isDisabled || isLocating} onClick={handleDeviceLocation} variant="outline" className="w-full sm:w-auto">
                  <MapPin className="mr-2 h-4 w-4" />
                  {isLocating ? "Locating..." : "Use this device's location"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">Only use this while you are at the branch</p>
              </div>

              <div className="flex items-center gap-2">
                <Button disabled={isDisabled} onClick={() => { setLatStr(""); setLngStr(""); setMapsLinkStr(""); }} variant="ghost">
                  Clear
                </Button>
                {latStr && lngStr && !isNaN(Number(latStr)) && !isNaN(Number(lngStr)) && (
                  <a 
                    href={`https://www.google.com/maps?q=${latStr},${lngStr}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Check on map
                  </a>
                )}
              </div>
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
