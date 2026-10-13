import { cn } from "@/lib/utils";

/** iOS-style thin progress bar. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-1 overflow-hidden rounded-full bg-fill", className)}
    >
      <div
        className="h-full rounded-full bg-tint transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
