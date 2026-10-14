import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { settingsService } from "@/services/settings.service";
import { parseWebsiteConfig, buildWebsiteConfig, WebsiteConfig, parseMapsLink, parseLocation } from "@/lib/websiteConfig";
import { MapPin, AlertCircle, Globe, Truck, Gift, LocateFixed, ExternalLink, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ComingSoonSection } from "@/components/settings/ComingSoonSection";
import { Section, Field, ToggleRow } from "@/components/settings/SettingsParts";

/** Everything the form edits, numbers kept as typed so a half-typed value isn't rewritten. */
interface Draft {
  form: WebsiteConfig;
  deliveryFee: string;
  freeDelivery: string;
  minOrder: string;
  prepTime: string;
  firstPct: string;
  lat: string;
  lng: string;
}

const draftFrom = (c: WebsiteConfig): Draft => ({
  form: c,
  deliveryFee: String(c.deliveryFee),
  freeDelivery: c.freeDeliveryAbove !== null ? String(c.freeDeliveryAbove) : "",
  minOrder: String(c.minOrder),
  prepTime: String(c.prepTimeMinutes),
  firstPct: c.firstOrderDiscount.percent ? String(c.firstOrderDiscount.percent) : "",
  lat: c.location ? String(c.location.lat) : "",
  lng: c.location ? String(c.location.lng) : "",
});

/** One status chip in the strip at the top. */
const StatusChip = ({ on, label }: { on: boolean; label: string }) => (
  <span className={cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
    on ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted/40 text-muted-foreground",
  )}>
    <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-success" : "bg-muted-foreground/50")} />
    {label}
  </span>
);

export function WebsiteSettingsTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rawConfig, setRawConfig] = useState<unknown>(null);
  const [onlineOrdersGlobally, setOnlineOrdersGlobally] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(parseWebsiteConfig(null)));
  // The draft as last loaded/saved, for the "unsaved changes" bar.
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [mapsLinkStr, setMapsLinkStr] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    settingsService.getMySettings()
      .then((res) => {
        if (!res) return;
        setOnlineOrdersGlobally(res.onlineOrders ?? true);
        setRawConfig(res.websiteConfig);
        const d = draftFrom(parseWebsiteConfig(res.websiteConfig));
        setDraft(d);
        setSavedSnapshot(JSON.stringify(d));
      })
      .catch((err: unknown) => {
        setLoadFailed(true);
        toast.error(err instanceof Error ? err.message : "Failed to load website settings");
      })
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((p) => ({ ...p, [key]: value }));
  const setForm = (patch: Partial<WebsiteConfig>) => setDraft((p) => ({ ...p, form: { ...p.form, ...patch } }));
  const { form } = draft;

  const handleSave = async () => {
    const dFee = Number(draft.deliveryFee);
    const mOrder = Number(draft.minOrder);
    const pTime = Number(draft.prepTime);
    const fdAbove = draft.freeDelivery.trim() === "" ? null : Number(draft.freeDelivery);

    if (isNaN(dFee) || dFee < 0) return toast.error("Invalid delivery fee");
    if (isNaN(mOrder) || mOrder < 0) return toast.error("Invalid minimum order");
    if (isNaN(pTime) || pTime < 1 || pTime > 180) return toast.error("Prep time must be between 1 and 180 minutes");
    if (fdAbove !== null && (isNaN(fdAbove) || fdAbove < 0)) return toast.error("Invalid free delivery threshold");
    const firstPct = draft.firstPct.trim() === "" ? 0 : Number(draft.firstPct);
    if (form.firstOrderDiscount.enabled && (isNaN(firstPct) || firstPct < 1 || firstPct > 90)) {
      return toast.error("First-order discount must be between 1% and 90%");
    }

    let finalLocation = null;
    const lStr = draft.lat.trim();
    const lnStr = draft.lng.trim();
    if (lStr !== "" || lnStr !== "") {
      const lat = Number(lStr);
      const lng = Number(lnStr);
      if (lStr === "" || lnStr === "" || isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
        return toast.error("Enter a valid latitude and longitude, or clear both");
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
      firstOrderDiscount: { enabled: form.firstOrderDiscount.enabled, percent: isNaN(firstPct) ? 0 : firstPct },
    };

    const payload = buildWebsiteConfig(rawConfig, finalForm);

    setSaving(true);
    try {
      await settingsService.updateSettings({ websiteConfig: payload });
      toast.success("Website settings updated");
      setRawConfig(payload);
      setSavedSnapshot(JSON.stringify(draft));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update website settings");
    } finally {
      setSaving(false);
    }
  };

  const handleApplyLink = () => {
    const res = parseMapsLink(mapsLinkStr);
    if (res.ok) {
      setDraft((p) => ({ ...p, lat: String(res.lat), lng: String(res.lng) }));
      setMapsLinkStr("");
    } else if ("reason" in res && res.reason === "short_link") {
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
        setDraft((p) => ({ ...p, lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) }));
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
  const dirty = !isDisabled && savedSnapshot !== "" && JSON.stringify(draft) !== savedSnapshot;
  // Both boxes filled: an empty one would read as 0 and put a half-typed pin on the map.
  const pin = draft.lat.trim() && draft.lng.trim() ? parseLocation({ lat: draft.lat, lng: draft.lng }) : null;
  const pct = Number(draft.firstPct);
  const examplePct = pct >= 1 && pct <= 90 ? pct : null;
  const offerOn = form.firstOrderDiscount.enabled && examplePct !== null;
  const ordersOn = form.enabled && onlineOrdersGlobally;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadFailed && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Could not load this branch's website settings — reload the page.</AlertDescription>
        </Alert>
      )}

      {isSuperAdmin && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Cannot Edit</AlertTitle>
          <AlertDescription>Website settings are per branch — sign in as that branch's Admin or Manager to change them.</AlertDescription>
        </Alert>
      )}

      {!onlineOrdersGlobally && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Note</AlertTitle>
          <AlertDescription>Online orders are switched off in General — website ordering stays closed until you switch them on.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {/* What the website shows for this branch, as currently edited */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
          <span className="mr-1 flex items-center gap-2 text-sm font-semibold">
            <Globe className="h-4 w-4 text-primary" /> On the website
          </span>
          <StatusChip on={ordersOn} label={ordersOn ? "Taking orders" : "Orders closed"} />
          <StatusChip on={form.reservationsEnabled} label={form.reservationsEnabled ? "Taking bookings" : "Bookings closed"} />
          <StatusChip on={form.onlinePayment} label={form.onlinePayment ? "Card payment on" : "Cash only"} />
          <StatusChip on={offerOn} label={offerOn ? `First order ${examplePct}% off` : "No first-order offer"} />
          <StatusChip on={!!pin} label={pin ? "Map pin set" : "No map pin"} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section icon={Globe} title="Website ordering" description="What customers can do on the website for this branch.">
            <ToggleRow id="ws-orders" label="Accept website orders" hint="Delivery and pickup orders from the website." checked={form.enabled} onChange={(c) => setForm({ enabled: c })} disabled={isDisabled} />
            <ToggleRow id="ws-bookings" label="Accept website reservations" hint="Table bookings and pre-orders for later." checked={form.reservationsEnabled} onChange={(c) => setForm({ reservationsEnabled: c })} disabled={isDisabled} />
            <ToggleRow id="ws-payment" label="Accept online payment" hint="Card through Safepay. Shows only once the Safepay keys are set on the server." checked={form.onlinePayment} onChange={(c) => setForm({ onlinePayment: c })} disabled={isDisabled} />
          </Section>

          <Section icon={Truck} title="Delivery & pickup" description="Fees and limits the website uses at checkout.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="ws-fee" label="Delivery fee (Rs)">
                <Input id="ws-fee" type="number" min="0" disabled={isDisabled} value={draft.deliveryFee} onChange={(e) => set("deliveryFee", e.target.value)} />
              </Field>
              <Field id="ws-free" label="Free delivery above (Rs)" hint="Empty = never free.">
                <Input id="ws-free" type="number" min="0" disabled={isDisabled} placeholder="Never" value={draft.freeDelivery} onChange={(e) => set("freeDelivery", e.target.value)} />
              </Field>
              <Field id="ws-min" label="Minimum order for delivery (Rs)">
                <Input id="ws-min" type="number" min="0" disabled={isDisabled} value={draft.minOrder} onChange={(e) => set("minOrder", e.target.value)} />
              </Field>
              <Field id="ws-prep" label="Prep time (minutes)" hint="1 to 180.">
                <Input id="ws-prep" type="number" min="1" max="180" disabled={isDisabled} value={draft.prepTime} onChange={(e) => set("prepTime", e.target.value)} />
              </Field>
            </div>
            <p className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>Opening hours and meal times are set in <Link to="/settings" className="font-medium text-primary hover:underline">General settings</Link>.</span>
            </p>
          </Section>

          <Section
            icon={Gift}
            title="First-order offer"
            description="A percent off a signed-in customer's first website order."
            action={<Switch aria-label="First-order discount" disabled={isDisabled} checked={form.firstOrderDiscount.enabled} onCheckedChange={(c) => setForm({ firstOrderDiscount: { ...form.firstOrderDiscount, enabled: c } })} />}
          >
            {form.firstOrderDiscount.enabled ? (
              <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-end">
                <Field id="ws-first" label="Discount (%)" hint="1 to 90.">
                  <Input id="ws-first" type="number" min="1" max="90" disabled={isDisabled} placeholder="e.g. 15" value={draft.firstPct} onChange={(e) => set("firstPct", e.target.value)} />
                </Field>
                <div className="mb-[22px] rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
                  {examplePct !== null ? (
                    <>A Rs 2,000 first order gets <span className="font-bold text-primary">Rs {Math.round(2000 * examplePct / 100).toLocaleString()}</span> off.</>
                  ) : (
                    <span className="text-muted-foreground">Enter a percent to see an example.</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Off. Switch it on to give new customers a percent off their first order.</p>
            )}
            <p className="text-[11px] text-muted-foreground">Not combined with deals or promo codes; a bigger Minimum Spend deal still wins.</p>
          </Section>

          <Section icon={MapPin} title="Branch location" description="Lets the website suggest the nearest branch to a customer.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="ws-lat" label="Latitude">
                <Input id="ws-lat" disabled={isDisabled} placeholder="e.g. 31.47" value={draft.lat} onChange={(e) => set("lat", e.target.value)} />
              </Field>
              <Field id="ws-lng" label="Longitude">
                <Input id="ws-lng" disabled={isDisabled} placeholder="e.g. 74.30" value={draft.lng} onChange={(e) => set("lng", e.target.value)} />
              </Field>
            </div>
            <Field id="ws-link" label="Paste a Google Maps link or coordinates">
              <div className="flex gap-2">
                <Input id="ws-link" disabled={isDisabled} placeholder="Paste here..." value={mapsLinkStr} onChange={(e) => setMapsLinkStr(e.target.value)} />
                <Button disabled={isDisabled || !mapsLinkStr} onClick={handleApplyLink} variant="secondary">Apply</Button>
              </div>
            </Field>
            {pin && (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <iframe
                  title="Branch pin"
                  src={`https://maps.google.com/maps?q=${pin.lat},${pin.lng}&z=16&output=embed`}
                  className="h-44 w-full border-0"
                  loading="lazy"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={isDisabled || isLocating} onClick={handleDeviceLocation} variant="outline" size="sm">
                <LocateFixed className="mr-1.5 h-4 w-4" />
                {isLocating ? "Locating..." : "Use this device's location"}
              </Button>
              {pin && (
                <Button asChild variant="ghost" size="sm">
                  <a href={`https://www.google.com/maps?q=${pin.lat},${pin.lng}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Open in Maps
                  </a>
                </Button>
              )}
              <Button disabled={isDisabled || (!draft.lat && !draft.lng)} onClick={() => { setDraft((p) => ({ ...p, lat: "", lng: "" })); setMapsLinkStr(""); }} variant="ghost" size="sm" className="ml-auto">
                Clear
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Use the device location only while you are at the branch.</p>
          </Section>
        </div>

        {/* Save bar: stays at the bottom of the screen while scrolling, like General. */}
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className={cn("flex items-center gap-2 text-xs font-medium", dirty ? "text-primary" : "text-muted-foreground")}>
            <span className={cn("h-2 w-2 rounded-full", dirty ? "bg-primary animate-pulse" : "bg-muted-foreground/40")} />
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(JSON.parse(savedSnapshot))}>Discard</Button>
            <Button className="gradient-primary text-primary-foreground" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      {/* Saved as you go (its own API), so it sits outside the save bar. */}
      <ComingSoonSection />
    </div>
  );
}
