import { useState, useEffect, useCallback } from "react";
import { Sparkles, Trash2, Plus, Loader2, MessageSquare, ThumbsUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { siteContentService, ComingSoonDish, DishSuggestion } from "@/services/siteContent.service";
import { Section } from "@/components/settings/SettingsParts";

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** "Coming soon" dishes customers vote for on the website, plus their dish suggestions. Chain-wide. */
export function ComingSoonSection() {
  const [dishes, setDishes] = useState<ComingSoonDish[]>([]);
  const [suggestions, setSuggestions] = useState<DishSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([siteContentService.listComingSoon(), siteContentService.listSuggestions()]);
      setDishes(d);
      setSuggestions(s);
    } catch (err) {
      toast.error(errorText(err, "Couldn't load the coming soon dishes"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (name.trim().length < 2) return toast.error("Enter the dish name");
    setAdding(true);
    try {
      await siteContentService.createComingSoon({ name: name.trim(), description: description.trim() || undefined });
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      toast.error(errorText(err, "Couldn't add the dish"));
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (dish: ComingSoonDish, isActive: boolean) => {
    try {
      await siteContentService.updateComingSoon(dish.id, { isActive });
      await load();
    } catch (err) {
      toast.error(errorText(err, "Couldn't update the dish"));
    }
  };

  const remove = async (dish: ComingSoonDish) => {
    if (!window.confirm(`Remove "${dish.name}" and its ${dish.votes} vote(s)?`)) return;
    try {
      await siteContentService.deleteComingSoon(dish.id);
      await load();
    } catch (err) {
      toast.error(errorText(err, "Couldn't remove the dish"));
    }
  };

  const removeSuggestion = async (id: string) => {
    try {
      await siteContentService.deleteSuggestion(id);
      setSuggestions((s) => s.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(errorText(err, "Couldn't remove the suggestion"));
    }
  };

  // Bars are relative to the most-wanted dish, so the leader always fills its bar.
  const maxVotes = Math.max(1, ...dishes.map((d) => d.votes));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Section
        icon={Sparkles}
        title="Coming soon"
        description="Dishes the website lists under Coming soon. Customers tap “I want this” to vote. Shared by every branch; saved as you go."
      >
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <Input placeholder="Dish name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Dish name" />
          <Input placeholder="Short note (optional)" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Short note" />
          <Button onClick={add} disabled={adding} className="gradient-primary text-primary-foreground">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
        ) : dishes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-primary/60" />
            <p className="mt-2 text-sm font-medium">No dishes yet</p>
            <p className="text-xs text-muted-foreground">The website hides the section until you add one.</p>
          </div>
        ) : (
          <ol className="space-y-2">
            {dishes.map((dish, i) => (
              <li key={dish.id} className={cn("flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3", !dish.isActive && "opacity-60")}>
                <span className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                  i === 0 && dish.votes > 0 ? "gradient-primary text-primary-foreground" : "bg-primary/10 text-primary",
                )}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{dish.name}</p>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-muted-foreground">
                      <ThumbsUp className="h-3 w-3" />{dish.votes}
                    </span>
                  </div>
                  {dish.description && <p className="truncate text-[11px] text-muted-foreground">{dish.description}</p>}
                  <Progress value={(dish.votes / maxVotes) * 100} className="mt-1.5 h-1.5" aria-label={`${dish.votes} votes`} />
                </div>
                <label className="flex shrink-0 flex-col items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Switch checked={dish.isActive} onCheckedChange={(c) => toggle(dish, c)} aria-label={`Show ${dish.name} on the website`} />
                  {dish.isActive ? "Shown" : "Hidden"}
                </label>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => remove(dish)} aria-label={`Remove ${dish.name}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section
        icon={MessageSquare}
        title="Customer suggestions"
        description="Answers to “Which dish should we start?” from the website, newest first."
        action={<span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold tabular-nums text-primary">{suggestions.length}</span>}
      >
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <MessageSquare className="mx-auto h-6 w-6 text-primary/60" />
            <p className="mt-2 text-sm font-medium">No suggestions yet</p>
            <p className="text-xs text-muted-foreground">They show up here when customers send one.</p>
          </div>
        ) : (
          <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
            {suggestions.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 break-words">“{s.text}”</span>
                <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeSuggestion(s.id)} aria-label="Remove suggestion">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
