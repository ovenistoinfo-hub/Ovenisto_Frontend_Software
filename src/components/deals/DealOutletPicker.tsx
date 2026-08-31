import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Store, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutletRecord } from "@/services/outlet.service";

interface DealOutletPickerProps {
  outlets: OutletRecord[];
  isSuperAdmin: boolean;
  ownOutletId: string | null;
  /** Current selection — empty means "all branches" (chain-wide). Ignored
   *  (display-only) for a non-Super-Admin, whose deal is always scoped to
   *  their own outlet regardless of this value. */
  value: string[];
  onChange: (ids: string[]) => void;
}

/** Super Admin picks any set of outlets, or "All branches" (persists
 *  outletIds: []). Every other role is locked to their own outlet — shown
 *  read-only here, and enforced again server-side regardless of what this
 *  component renders (defence in depth, not the security boundary). */
export function DealOutletPicker({ outlets, isSuperAdmin, ownOutletId, value, onChange }: DealOutletPickerProps) {
  if (!isSuperAdmin) {
    const ownOutlet = outlets.find((o) => o.id === ownOutletId);
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/25 px-3 py-2">
        <Store className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-foreground">
          {ownOutlet ? ownOutlet.name : "Your outlet"}
        </span>
        <span className="text-xs text-muted-foreground">— deals you publish only apply here</span>
      </div>
    );
  }

  const isAllBranches = value.length === 0;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onChange([])}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
          isAllBranches ? "border-primary bg-primary/[0.06] text-foreground" : "border-border/70 text-muted-foreground hover:bg-muted/25"
        )}
      >
        <Building2 className="h-4 w-4" />
        <span className="font-medium">All branches</span>
        <span className="text-xs">(chain-wide)</span>
      </button>

      {outlets.length > 0 && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {outlets.map((outlet) => {
            const checked = value.includes(outlet.id);
            return (
              <Label
                key={outlet.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm font-normal"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    if (next) onChange([...value, outlet.id]);
                    else onChange(value.filter((id) => id !== outlet.id));
                  }}
                />
                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                {outlet.name}
              </Label>
            );
          })}
        </div>
      )}
    </div>
  );
}
