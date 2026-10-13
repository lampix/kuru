import { type VariantProps, cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** iOS system buttons: filled, tinted (gray fill + tint label) and plain. */
export const iosButton = cva(
  "inline-flex items-center justify-center gap-2 font-semibold transition-opacity active:opacity-60 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        filled: "bg-tint text-white",
        tinted: "bg-tint/15 text-tint",
        gray: "bg-fill-3 text-label",
        plain: "text-tint",
        destructive: "bg-ios-red/15 text-ios-red",
      },
      size: {
        sm: "h-8 rounded-full px-3.5 text-subhead",
        md: "h-11 rounded-xl px-5 text-body",
        lg: "h-[50px] rounded-[14px] px-6 text-body w-full",
      },
    },
    defaultVariants: { variant: "filled", size: "md" },
  },
);

export function IosButton({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof iosButton>) {
  return (
    <button type="button" className={cn(iosButton({ variant, size }), className)} {...props} />
  );
}
