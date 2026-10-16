import { type CardStatus, STATUS_COLOR } from "@/lib/browse/filter";
import { cn } from "@/lib/utils";

/** A small coloured circle showing a card's status. */
export function StatusDot({
  status,
  label,
  className,
}: {
  status: CardStatus;
  /** Accessible name; omit when the status is spelled out next to the dot. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block size-2.5 shrink-0 rounded-full", STATUS_COLOR[status], className)}
    />
  );
}
