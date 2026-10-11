import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Store, Receipt, Wallet, Clock, UtensilsCrossed, SlidersHorizontal, Plus, X, Moon, AlertCircle, type LucideIcon } from "lucide-react";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { TimePicker } from "@/components/ui/time-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { settingsService, type SettingsRecord } from "@/services/settings.service";
import { mealTypeService, type MealTypeRecord } from "@/services/mealType.service";
import { parseWebsiteConfig, withServiceHours } from "@/lib/websiteConfig";
import { formatMealHours, isWindowInside } from "@/lib/mealTime";

type Times = { open: string; close: string };

interface GeneralForm {
  businessName: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
  taxName: string;
  taxRate: string;
  receiptHeader: string;
  paymentMethods: string[];
  tableManagement: boolean;
  onlineOrders: boolean;
  graceMinutes: number;
  /** "" = not set. */
  hours: Times;
  /** Per MealType id; keeps entries of inactive meal types too. */
  mealTimes: Record<string, Times>;
}

const NO_TIMES: Times = { open: "", close: "" };

function formFromSettings(data: SettingsRecord): GeneralForm {
  // Opening hours and meal times live in the branch's websiteConfig JSON (read by the website, POS, Waiter, Self-Order).
  const { hours, mealHours } = parseWebsiteConfig(data.websiteConfig);
  return {
    businessName: data.restaurantName || "",
    phone: data.phone || "",
    email: data.email || "",
    address: data.address || "",
    currency: data.currency || "Rs.",
    taxName: data.taxName || "GST",
    taxRate: String(data.taxRate ?? 16),
    receiptHeader: data.receiptHeader || "",
    paymentMethods: data.paymentMethods ?? ["Cash", "Credit Card", "Account", "JazzCash", "EasyPaisa"],
    tableManagement: data.tableManagement,
    onlineOrders: data.onlineOrders,
    graceMinutes: data.graceMinutes ?? 15,
    hours: hours ?? NO_TIMES,
    mealTimes: mealHours,
  };
}

/** One settings group: icon, title, one-line purpose, then its fields. */
function Section({ icon: Icon, title, description, action, className, children }: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 flex items-center justify-center">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

const Field = ({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

const ToggleRow = ({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
    <div className="min-w-0">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
);

/** A time range as typed: "" both = not set, one side only / equal = invalid. */
const timesState = (t: Times) => (!t.open && !t.close ? "unset" : !t.open || !t.close || t.open === t.close ? "invalid" : "set");

export function GeneralSettingsTab() {
  const { updateSettings } = useData();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<GeneralForm | null>(null);
  // The JSON of the form as last loaded/saved, for the "unsaved changes" bar.
  const [savedSnapshot, setSavedSnapshot] = useState("");
  // websiteConfig as stored: the save writes hours/meal times into it and must keep the website keys.
  const [rawWebsiteConfig, setRawWebsiteConfig] = useState<unknown>(null);
  const [mealTypes, setMealTypes] = useState<MealTypeRecord[] | null>(null);
  const [newMethod, setNewMethod] = useState("");

  useEffect(() => {
    settingsService.getMySettings()
      .then((data) => {
        const f = formFromSettings(data);
        setForm(f);
        setSavedSnapshot(JSON.stringify(f));
        setRawWebsiteConfig(data.websiteConfig);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
    mealTypeService.getAll()
      .then((list) => setMealTypes(list.filter((m) => m.status === "active")))
      .catch(() => setMealTypes([]));
  }, []);

  const set = <K extends keyof GeneralForm>(key: K, value: GeneralForm[K]) => setForm((p) => (p ? { ...p, [key]: value } : p));
  const setMealTime = (id: string, key: keyof Times, value: string) =>
    setForm((p) => (p ? { ...p, mealTimes: { ...p.mealTimes, [id]: { ...(p.mealTimes[id] ?? NO_TIMES), [key]: value } } } : p));

  if (loading) {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}
      </div>
    );
  }

  if (loadFailed || !form) {
    // Never show an editable empty form here: saving it would wipe the branch's real settings.
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Couldn't load this branch's settings</AlertTitle>
        <AlertDescription>Reload the page to try again.</AlertDescription>
      </Alert>
    );
  }

  const dirty = JSON.stringify(form) !== savedSnapshot;
  const hoursState = timesState(form.hours);
  const overnight = hoursState === "set" && form.hours.close <= form.hours.open;
  // Meal times must sit inside the opening hours (when set); the pickers only offer those times.
  const openRange = hoursState === "set" ? form.hours : null;
  const mealState = (t: Times) => {
    const state = timesState(t);
    return state === "set" && openRange && !isWindowInside(t, openRange) ? "outside" : state;
  };

  const addMethod = () => {
    const val = newMethod.trim();
    if (!val) return toast.error("Enter a payment method name");
    if (form.paymentMethods.some((m) => m.toLowerCase() === val.toLowerCase())) return toast.warning("Payment method already exists");
    set("paymentMethods", [...form.paymentMethods, val]);
    setNewMethod("");
  };

  const save = async () => {
    const rate = Number(form.taxRate);
    if (isNaN(rate) || rate < 0 || rate > 100) return toast.error("Tax rate must be between 0 and 100");
    if (form.email && !form.email.includes("@")) return toast.error("Invalid email format");
    if (form.graceMinutes < 10 || form.graceMinutes > 30) return toast.error("Grace period must be between 10 and 30 minutes");
    if (hoursState === "invalid") return toast.error("Set both opening and closing time (different), or clear both");
    const mealHours: Record<string, Times> = {};
    for (const [id, t] of Object.entries(form.mealTimes)) {
      const state = mealState(t);
      const name = mealTypes?.find((m) => m.id === id)?.name ?? "a meal";
      if (state === "invalid") return toast.error(`Set both times for ${name} (different), or clear both`);
      if (state === "outside" && openRange) return toast.error(`${name} must be inside the opening hours (${formatMealHours(openRange)})`);
      if (state === "set") mealHours[id] = t;
    }
    const websiteConfig = withServiceHours(rawWebsiteConfig, hoursState === "set" ? form.hours : null, mealHours);

    setSaving(true);
    try {
      const res = await settingsService.updateSettings({
        restaurantName: form.businessName,
        phone: form.phone || null,
        email: form.email || null,
        currency: form.currency,
        taxName: form.taxName,
        taxRate: rate,
        address: form.address || null,
        receiptHeader: form.receiptHeader || null,
        tableManagement: form.tableManagement,
        onlineOrders: form.onlineOrders,
        graceMinutes: form.graceMinutes,
        paymentMethods: form.paymentMethods,
        websiteConfig,
      });
      // Every open page reads these through DataContext.
      updateSettings({
        restaurantName: res.restaurantName || "",
        phone: res.phone || "",
        email: res.email || "",
        currency: res.currency || "Rs.",
        taxName: res.taxName || "GST",
        taxRate: Number(res.taxRate ?? 16),
        address: res.address || "",
        receiptHeader: res.receiptHeader || "",
        tableManagement: res.tableManagement,
        onlineOrders: res.onlineOrders,
        paymentMethods: res.paymentMethods,
      });
      setRawWebsiteConfig(websiteConfig);
      setSavedSnapshot(JSON.stringify(form));
      // POS / Waiter Panel read meal times through useMealTimes.
      queryClient.invalidateQueries({ queryKey: ["meal-times"] });
      toast.success("Settings saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2 items-start">
        <Section icon={Store} title="Business profile" description="Shown on receipts, the website and customer screens.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="gs-name" label="Business name">
              <Input id="gs-name" value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />
            </Field>
            <Field id="gs-phone" label="Phone">
              <Input id="gs-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="03XX-XXXXXXX" />
            </Field>
          </div>
          <Field id="gs-email" label="Email">
            <Input id="gs-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field id="gs-address" label="Address">
            <Textarea id="gs-address" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </Section>

        <Section icon={Receipt} title="Billing & receipts" description="Currency, tax and the line printed on every bill.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="gs-currency" label="Currency">
              <Input id="gs-currency" value={form.currency} onChange={(e) => set("currency", e.target.value)} />
            </Field>
            <Field id="gs-taxname" label="Tax name">
              <Input id="gs-taxname" value={form.taxName} onChange={(e) => set("taxName", e.target.value)} />
            </Field>
            <Field id="gs-taxrate" label="Tax rate (%)">
              <Input id="gs-taxrate" type="number" min="0" max="100" value={form.taxRate} onChange={(e) => set("taxRate", e.target.value)} />
            </Field>
          </div>
          <Field id="gs-receipt" label="Receipt header" hint="Printed at the top of customer bills.">
            <Textarea id="gs-receipt" rows={2} value={form.receiptHeader} onChange={(e) => set("receiptHeader", e.target.value)} />
          </Field>
        </Section>

        <Section
          icon={Clock}
          title="Opening hours"
          description="Shown on the website; online booking times stay inside them."
          action={(form.hours.open || form.hours.close) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => set("hours", NO_TIMES)}>Clear</Button>
          )}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="gs-open" label="Opens at">
              <TimePicker id="gs-open" placeholder="Not set" value={form.hours.open} onChange={(v) => set("hours", { ...form.hours, open: v })} />
            </Field>
            <Field id="gs-close" label="Closes at">
              <TimePicker id="gs-close" placeholder="Not set" value={form.hours.close} onChange={(v) => set("hours", { ...form.hours, close: v })} />
            </Field>
          </div>
          <p className={cn("text-[11px] flex items-center gap-1.5", hoursState === "invalid" ? "text-destructive" : "text-muted-foreground")}>
            {hoursState === "set" && overnight && <Moon className="h-3 w-3 shrink-0" />}
            {hoursState === "unset" && "Not set — the website hides the hours."}
            {hoursState === "invalid" && "Set both times, and make them different."}
            {hoursState === "set" && `Open ${formatMealHours(form.hours)}${overnight ? " (closes after midnight)" : ""}.`}
          </p>
        </Section>

        <Section icon={SlidersHorizontal} title="Operations" description="Features this branch uses, and staff attendance rules.">
          <ToggleRow id="gs-tables" label="Table management" hint="Floor, tables and dine-in seating." checked={form.tableManagement} onChange={(v) => set("tableManagement", v)} />
          <ToggleRow id="gs-online" label="Online orders" hint="Master switch; website ordering also needs Website → Accept orders." checked={form.onlineOrders} onChange={(v) => set("onlineOrders", v)} />
          <Field id="gs-grace" label="Attendance grace period" hint="Clock-ins later than this past the shift start count as late.">
            <Select value={String(form.graceMinutes)} onValueChange={(v) => set("graceMinutes", Number(v))}>
              <SelectTrigger id="gs-grace"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 15, 20, 25, 30].map((m) => <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </Section>

        <Section
          icon={UtensilsCrossed}
          title="Meal times"
          description="Outside a meal's time its dishes show “Not available” on POS, Waiter Panel, Self-Order and the website. Times stay inside the opening hours; leave a meal blank to serve it all day."
          className="xl:col-span-2"
        >
          {mealTypes === null ? (
            <Skeleton className="h-24 w-full" />
          ) : mealTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active meal types yet. Add them under Items → Meal Types.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {mealTypes.map((m) => {
                const t = form.mealTimes[m.id] ?? NO_TIMES;
                const state = mealState(t);
                const bad = state === "invalid" || state === "outside";
                return (
                  <div key={m.id} className={cn("rounded-xl border px-3 py-3 space-y-2.5", bad ? "border-destructive/50 bg-destructive/5" : "border-border/60 bg-muted/20")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{m.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-full",
                          state === "set" ? "bg-primary/10 text-primary" : bad ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                        )}>
                          {state === "set" ? formatMealHours(t) : state === "invalid" ? "Incomplete" : state === "outside" ? "Outside opening hours" : "All day"}
                        </span>
                        {state !== "unset" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Clear ${m.name} times`} onClick={() => { setMealTime(m.id, "open", ""); setMealTime(m.id, "close", ""); }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`gs-meal-${m.id}-open`} className="text-[11px] text-muted-foreground">From</Label>
                        <TimePicker id={`gs-meal-${m.id}-open`} placeholder="Not set" range={openRange} value={t.open} onChange={(v) => setMealTime(m.id, "open", v)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`gs-meal-${m.id}-close`} className="text-[11px] text-muted-foreground">To</Label>
                        <TimePicker id={`gs-meal-${m.id}-close`} placeholder="Not set" range={openRange} value={t.close} onChange={(v) => setMealTime(m.id, "close", v)} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section icon={Wallet} title="Payment methods" description="The methods offered at checkout on POS and Waiter Panel." className="xl:col-span-2">
          <div className="flex flex-wrap gap-2">
            {form.paymentMethods.map((pm) => (
              <span key={pm} className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full border border-border/70 bg-muted/40 text-xs font-semibold">
                {pm}
                <button
                  type="button"
                  onClick={() => set("paymentMethods", form.paymentMethods.filter((x) => x !== pm))}
                  className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={`Remove ${pm}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {form.paymentMethods.length === 0 && <p className="text-xs text-muted-foreground italic">No payment methods. Add at least one.</p>}
          </div>
          <div className="flex items-center gap-2 max-w-sm">
            <Input
              aria-label="New payment method"
              placeholder="e.g. Bank Transfer, HBL"
              value={newMethod}
              onChange={(e) => setNewMethod(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMethod(); } }}
            />
            <Button type="button" variant="outline" onClick={addMethod} className="shrink-0">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </Section>
      </div>

      {/* Save bar: stays at the bottom of the screen while scrolling. */}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/95 backdrop-blur px-4 py-3 shadow-lg">
        <span className={cn("flex items-center gap-2 text-xs font-medium", dirty ? "text-primary" : "text-muted-foreground")}>
          <span className={cn("h-2 w-2 rounded-full", dirty ? "bg-primary animate-pulse" : "bg-muted-foreground/40")} />
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!dirty || saving} onClick={() => setForm(JSON.parse(savedSnapshot))}>Discard</Button>
          <Button className="gradient-primary text-primary-foreground" disabled={!dirty || saving} onClick={save}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
