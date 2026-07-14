import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <Select value={outletId} onValueChange={setOutletId}>
      <SelectTrigger className="w-[180px] h-9 text-sm">
        <SelectValue placeholder="Outlet" />
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
