import * as React from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Time field built on the app's own Popover instead of `<input type="time">`.
 *
 * Same reason as DatePicker: the native control's clock glyph is painted by the
 * browser and disappears against a dark surface, and its segmented text can't
 * be themed. Three columns — hour, minute, AM/PM — read faster than typing into
 * a masked field anyway.
 *
 * The value stays 24-hour "HH:mm", which is what the API stores and what the
 * server's startTime/endTime comparison expects; only the display is 12-hour.
 */
export interface TimePickerProps {
  /** 24-hour "HH:mm". */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Set when a sibling <Label htmlFor> points at this field. */
  id?: string;
  className?: string;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTE_STEPS = Array.from({ length: 12 }, (_, i) => i * 5);

interface TimeParts {
  hour12: number;
  minute: number;
  meridiem: "AM" | "PM";
}

function parseTime(value: string): TimeParts {
  const [rawH, rawM] = (value || "00:00").split(":").map(Number);
  const hour24 = Number.isFinite(rawH) ? Math.min(23, Math.max(0, rawH)) : 0;
  const minute = Number.isFinite(rawM) ? Math.min(59, Math.max(0, rawM)) : 0;
  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    meridiem: hour24 >= 12 ? "PM" : "AM",
  };
}

function toValue({ hour12, minute, meridiem }: TimeParts): string {
  const base = hour12 % 12;
  const hour24 = meridiem === "PM" ? base + 12 : base;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour24)}:${pad(minute)}`;
}

/** "3:00 PM" — the display form, exported so a summary line elsewhere reads the
 *  same as the picker rather than showing raw 24-hour text. */
export function formatTimeLabel(value: string): string {
  const { hour12, minute, meridiem } = parseTime(value);
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

export function TimePicker({ value, onChange, disabled, id, className }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const parts = parseTime(value);

  // Keep an off-step minute (23:59 is the form's own default end time) in the
  // list, so opening the picker never silently rounds the saved value away.
  const minutes = MINUTE_STEPS.includes(parts.minute)
    ? MINUTE_STEPS
    : [...MINUTE_STEPS, parts.minute].sort((a, b) => a - b);

  const set = (patch: Partial<TimeParts>) => onChange(toValue({ ...parts, ...patch }));

  const columnButton = (selected: boolean) =>
    cn(
      "w-full h-8 rounded-md text-xs font-mono font-bold transition-colors",
      selected
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full h-10 justify-start gap-2 px-3 text-xs font-mono font-medium",
            "border-border/70 bg-muted/20 hover:bg-muted/40 hover:border-primary/40",
            className
          )}
        >
          <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
          {formatTimeLabel(value)}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex divide-x divide-border">
          <ScrollArea className="h-56 w-16">
            <div className="p-1 space-y-1">
              {HOURS_12.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => set({ hour12: h })}
                  className={columnButton(h === parts.hour12)}
                >
                  {String(h).padStart(2, "0")}
                </button>
              ))}
            </div>
          </ScrollArea>

          <ScrollArea className="h-56 w-16">
            <div className="p-1 space-y-1">
              {minutes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ minute: m })}
                  className={columnButton(m === parts.minute)}
                >
                  {String(m).padStart(2, "0")}
                </button>
              ))}
            </div>
          </ScrollArea>

          <div className="p-1 space-y-1 w-16">
            {(["AM", "PM"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set({ meridiem: m })}
                className={columnButton(m === parts.meridiem)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
