import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Date field built on the app's own Calendar + Popover instead of `<input
 * type="date">`.
 *
 * The native control paints its calendar glyph with the browser's own colour,
 * which is invisible against this app's dark surfaces, and its `mm/dd/yyyy`
 * placeholder cannot be styled or relabelled. This trigger is an ordinary
 * Button, so it inherits the same theming as every other control on the form.
 *
 * The value stays a plain "YYYY-MM-DD" string, the shape the API already takes.
 * Parsing goes through local Y/M/D parts rather than `new Date(str)`, which
 * would read the string as UTC midnight and land on the previous day for
 * anywhere east of Greenwich — Pakistan included.
 */
export interface DatePickerProps {
  /** "YYYY-MM-DD", or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Earliest selectable date, "YYYY-MM-DD". */
  min?: string;
  /** Show an inline clear button once a date is set. */
  clearable?: boolean;
  className?: string;
}

function parseYmd(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toYmd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "23 Aug 2026" — what the trigger shows, and what any summary line should
 *  show too, so a date reads the same wherever it appears. */
export function formatDateLabel(value: string): string {
  const parsed = parseYmd(value);
  return parsed ? format(parsed, "dd MMM yyyy") : "—";
}

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "Pick a date",
  min,
  clearable,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseYmd(value);
  const minDate = parseYmd(min ?? "");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full h-10 justify-start gap-2 px-3 text-xs font-mono font-medium",
              "border-border/70 bg-muted/20 hover:bg-muted/40 hover:border-primary/40",
              !selected && "text-muted-foreground font-sans",
              clearable && selected && "pr-9",
              className
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
            {selected ? format(selected, "dd MMM yyyy") : placeholder}
          </Button>
        </PopoverTrigger>

        {clearable && selected && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear date"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDate}
          disabled={minDate ? { before: minDate } : undefined}
          onSelect={(date) => {
            if (date) onChange(toYmd(date));
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
