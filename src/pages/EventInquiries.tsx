import { useState, useEffect, useCallback } from "react";
import {
  PartyPopper, RefreshCw, Users, MapPin, Phone, Store, Search, Cake, Heart, Briefcase, Moon, Truck,
  Inbox, PhoneCall, CheckCircle2, CalendarClock, type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { pktDateStr } from "@/lib/deals";
import { daysUntil, whenLabel } from "@/lib/eventInquiry";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { siteContentService, EventInquiry, EventInquiryStatus } from "@/services/siteContent.service";

type Filter = EventInquiryStatus | "upcoming" | "all";

// The website's occasions (backend EVENT_TYPES); anything else falls back to the party icon.
const TYPE_ICON: Record<string, LucideIcon> = {
  Birthday: Cake,
  Wedding: Heart,
  Corporate: Briefcase,
  "Family gathering": Users,
  "Milad / Aqeeqah": Moon,
  "Catering at your venue": Truck,
};

const STATUSES: { value: EventInquiryStatus; label: string; icon: LucideIcon }[] = [
  { value: "new", label: "New", icon: Inbox },
  { value: "contacted", label: "Contacted", icon: PhoneCall },
  { value: "closed", label: "Closed", icon: CheckCircle2 },
];

const STATUS_STYLE: Record<EventInquiryStatus, string> = {
  new: "bg-warning/15 text-warning border-warning/30",
  contacted: "bg-info/15 text-info border-info/30",
  closed: "bg-muted text-muted-foreground border-border",
};

/** Events & catering requests sent from the website's Events page. */
export default function EventInquiries() {
  const [inquiries, setInquiries] = useState<EventInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("new");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      api.clearCache("/site-content");
      setInquiries(await siteContentService.listEventInquiries());
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't load event inquiries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // No socket event for website inquiries yet; a slow poll keeps an open tab current.
  useVisiblePolling(load, 180_000);

  const setStatus = async (inquiry: EventInquiry, status: EventInquiryStatus) => {
    if (inquiry.status === status) return;
    try {
      await siteContentService.updateEventInquiry(inquiry.id, status);
      setInquiries((list) => list.map((i) => (i.id === inquiry.id ? { ...i, status } : i)));
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't update the inquiry");
    }
  };

  const today = pktDateStr();
  // Upcoming = still open (not closed) and within the next 7 days.
  const isUpcoming = (i: EventInquiry) => {
    const d = daysUntil(i.eventDate, today);
    return i.status !== "closed" && d >= 0 && d <= 7;
  };
  const counts = {
    new: inquiries.filter((i) => i.status === "new").length,
    contacted: inquiries.filter((i) => i.status === "contacted").length,
    closed: inquiries.filter((i) => i.status === "closed").length,
    upcoming: inquiries.filter(isUpcoming).length,
  };

  const q = query.trim().toLowerCase();
  const shown = inquiries
    .filter((i) => filter === "all" || (filter === "upcoming" ? isUpcoming(i) : i.status === filter))
    .filter((i) => !q || [i.name, i.phone, i.eventType, i.outletName ?? ""].some((v) => v.toLowerCase().includes(q)));

  const tiles: { key: Filter; label: string; value: number; icon: LucideIcon; hint: string }[] = [
    { key: "new", label: "New", value: counts.new, icon: Inbox, hint: "Not called yet" },
    { key: "contacted", label: "Contacted", value: counts.contacted, icon: PhoneCall, hint: "Called, still open" },
    { key: "upcoming", label: "Next 7 days", value: counts.upcoming, icon: CalendarClock, hint: "Open, event soon" },
    { key: "closed", label: "Closed", value: counts.closed, icon: CheckCircle2, hint: "Done or dropped" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<PartyPopper className="h-5 w-5" />}
        title="Event Inquiries"
        subtitle="Birthday, wedding, corporate and catering requests from the website. Call the customer, then mark the inquiry."
        actions={
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />Refresh
          </Button>
        }
      />

      {/* Tiles double as filters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(filter === t.key ? "all" : t.key)}
            aria-pressed={filter === t.key}
            className={cn(
              "flex items-center justify-between rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40",
              filter === t.key ? "border-primary ring-2 ring-primary/20" : "border-border/70",
            )}
          >
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.label}</span>
              <span className="mt-1 block text-2xl font-bold tabular-nums text-foreground">{t.value}</span>
              <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
            </span>
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", filter === t.key ? "gradient-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
              <t.icon className="h-5 w-5" />
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or occasion" className="pl-9" aria-label="Search inquiries" />
        </div>
        <span className="text-sm text-muted-foreground">
          {filter === "all" ? "All inquiries" : tiles.find((t) => t.key === filter)?.label} · {shown.length}
        </span>
        {filter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>Show all</Button>
        )}
      </div>

      {loading && inquiries.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><PartyPopper className="h-6 w-6" /></span>
            <p className="font-semibold">No inquiries here</p>
            <p className="text-sm text-muted-foreground">Requests from the website's Events page show up on this list.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => {
            const Icon = TYPE_ICON[i.eventType] ?? PartyPopper;
            const days = daysUntil(i.eventDate, today);
            const date = new Date(`${i.eventDate}T00:00:00`);
            return (
              <Card key={i.id} className={cn("flex flex-col shadow-sm transition-shadow hover:shadow-md", i.status === "closed" && "opacity-75")}>
                <CardContent className="flex flex-1 flex-col gap-4 p-4">
                  <div className="flex items-start gap-3">
                    {/* Calendar block: the event date at a glance */}
                    <div className="flex w-14 shrink-0 flex-col items-center overflow-hidden rounded-xl border border-border/70 bg-background text-center">
                      <span className="w-full gradient-primary py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                        {date.toLocaleDateString(undefined, { month: "short" })}
                      </span>
                      <span className="pt-1 text-xl font-bold leading-none tabular-nums">{date.getDate()}</span>
                      <span className="pb-1 text-[10px] text-muted-foreground">{date.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <Icon className="h-4 w-4 shrink-0 text-primary" /> <span className="truncate">{i.eventType}</span>
                      </p>
                      <span className={cn(
                        "mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        days < 0 ? "bg-muted text-muted-foreground" : days <= 2 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                      )}>
                        {whenLabel(days)}
                      </span>
                    </div>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_STYLE[i.status])}>{i.status}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1"><Users className="h-3.5 w-3.5 text-muted-foreground" />{i.guests} guests</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{i.venue === "your_venue" ? "At their venue" : "At Ovenisto"}</span>
                    {i.outletName && <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1"><Store className="h-3.5 w-3.5 text-muted-foreground" />{i.outletName}</span>}
                  </div>

                  <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{i.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{i.phone}</p>
                    </div>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <a href={`tel:${i.phone}`}><Phone className="h-3.5 w-3.5 mr-1" />Call</a>
                    </Button>
                  </div>

                  {i.notes && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{i.notes}</p>}

                  <div className="mt-auto space-y-2">
                    {/* One tap to move the inquiry along */}
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1" role="radiogroup" aria-label="Inquiry status">
                      {STATUSES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          role="radio"
                          aria-checked={i.status === s.value}
                          onClick={() => setStatus(i, s.value)}
                          className={cn(
                            "flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                            i.status === s.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <s.icon className="h-3.5 w-3.5" />{s.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Received {new Date(i.createdAt).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
