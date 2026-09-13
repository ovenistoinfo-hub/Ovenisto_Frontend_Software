import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";
import type { OutletRecord } from "@/services/outlet.service";

interface OutletFilterSelectProps {
  outletId: string;
  setOutletId: (id: string) => void;
  outlets: OutletRecord[];
  isSuperAdmin: boolean;
}

export function OutletFilterSelect({ outletId, setOutletId, outlets, isSuperAdmin }: OutletFilterSelectProps) {
  if (!isSuperAdmin) return null;
  return (
    <Select value={outletId || "all"} onValueChange={setOutletId}>
      <SelectTrigger className="w-[170px] sm:w-[190px] h-8 text-xs bg-card/80 border-border/70 font-medium hover:bg-card transition-colors shrink-0">
        <Building2 className="h-3.5 w-3.5 text-primary shrink-0 mr-1.5" />
        <SelectValue placeholder="Select Branch" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Outlets</SelectItem>
        {outlets.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
