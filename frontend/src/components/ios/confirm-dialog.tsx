"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** iOS-style alert asking to confirm an action, with a cancel and a (destructive) confirm button. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  onConfirm,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  const common = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[300px] gap-0 rounded-[14px] border-0 bg-grouped-2 p-0 text-center"
      >
        <DialogTitle className="px-4 pt-5 text-headline">{title}</DialogTitle>
        <DialogDescription className="px-4 pt-1 pb-4 text-footnote text-label">
          {message}
        </DialogDescription>
        <div className="grid grid-cols-2 hairline-t">
          <button
            type="button"
            className="py-3 text-tint active:bg-fill-3"
            onClick={() => onOpenChange(false)}
          >
            {common("cancel")}
          </button>
          <button
            type="button"
            className={cn(
              "border-l-[0.5px] border-separator py-3 font-semibold active:bg-fill-3",
              destructive ? "text-ios-red" : "text-tint",
            )}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
