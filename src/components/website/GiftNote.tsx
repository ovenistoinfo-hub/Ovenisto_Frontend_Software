import { Gift, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A website gift order: who it is for, their phone and the card message (the buyer is the order's own name).
 * Renders nothing for an ordinary order, so every screen can drop it in.
 */
export function GiftNote({ name, phone, message, className }: {
  name?: string | null;
  phone?: string | null;
  message?: string | null;
  className?: string;
}) {
  if (!name) return null;
  return (
    <div className={cn("rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs", className)}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold text-foreground">
        <span className="inline-flex items-center gap-1 text-primary"><Gift className="h-3.5 w-3.5" /> Gift for</span>
        {name}
        {phone && (
          <a href={`tel:${phone}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <Phone className="h-3 w-3" /> {phone}
          </a>
        )}
      </p>
      {message && <p className="mt-1 italic text-muted-foreground">Card: “{message}”</p>}
    </div>
  );
}
