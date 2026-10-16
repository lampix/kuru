"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error";

interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

const VISIBLE_MS = 1600;
const ERROR_VISIBLE_MS = 4000;

/**
 * A transient confirmation pill (like iOS' "Saved" HUD), shown above the tab bar.
 * Returns the element to render and a `show` function. `aboveToolbar` lifts it over a screen's
 * bottom toolbar.
 */
export function useToast({ aboveToolbar = false }: { aboveToolbar?: boolean } = {}): {
  toast: ReactNode;
  show: (text: string, tone?: ToastTone) => void;
} {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: ToastTone = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setMessage({ id: Date.now(), text, tone });
    timer.current = setTimeout(
      () => setMessage(null),
      tone === "error" ? ERROR_VISIBLE_MS : VISIBLE_MS,
    );
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const toast = (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4",
        // A screen's own toolbar (44pt) can sit on top of the tab bar.
        aboveToolbar
          ? "bottom-[calc(49px+44px+env(safe-area-inset-bottom)+12px)]"
          : "bottom-[calc(49px+env(safe-area-inset-bottom)+12px)]",
      )}
    >
      <AnimatePresence>
        {message ? (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={cn(
              "flex items-center gap-2 rounded-full glass px-4 py-2 text-subhead font-semibold shadow-lg",
              message.tone === "error" ? "text-ios-red" : "text-label",
            )}
          >
            {message.tone === "error" ? (
              <CircleAlert className="size-[18px] shrink-0" aria-hidden />
            ) : (
              <CircleCheck className="size-[18px] shrink-0 text-ios-green" aria-hidden />
            )}
            <span>{message.text}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  return { toast, show };
}
