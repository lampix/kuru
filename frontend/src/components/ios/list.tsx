"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** An inset grouped table section (iOS "insetGrouped" list style). */
export function ListSection({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-6 first:mt-2", className)}>
      {header ? (
        <h3 className="px-4 pb-1.5 text-footnote text-label-2 uppercase">{header}</h3>
      ) : null}
      <div className="overflow-hidden rounded-[10px] bg-grouped-2">{children}</div>
      {footer ? <p className="px-4 pt-1.5 text-footnote text-label-2">{footer}</p> : null}
    </section>
  );
}

/** Rounded-square SF-Symbol style icon used in settings rows. */
export function RowIcon({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span
      className="flex size-[29px] shrink-0 items-center justify-center rounded-[7px] text-white"
      style={{ backgroundColor: color }}
    >
      <Icon className="size-[18px]" strokeWidth={2.2} aria-hidden />
    </span>
  );
}

interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  accessory?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  tinted?: boolean;
  disabled?: boolean;
  className?: string;
}

/** A table row. Renders as a link, a button or a static row. */
export function ListRow({
  title,
  subtitle,
  detail,
  icon,
  accessory,
  href,
  onClick,
  chevron,
  destructive,
  tinted,
  disabled,
  className,
}: ListRowProps) {
  const interactive = Boolean(href || onClick) && !disabled;
  const content = (
    <>
      {icon ? <span className="py-2 pl-4">{icon}</span> : null}
      <span
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 hairline-b group-last/row:shadow-none",
          icon ? "pl-0" : "pl-4",
        )}
      >
        <span className="min-w-0 flex-1 text-left">
          <span
            className={cn(
              "block leading-snug break-words",
              destructive && "text-ios-red",
              tinted && "text-tint",
              disabled && "opacity-40",
            )}
          >
            {title}
          </span>
          {subtitle ? (
            <span className="block truncate text-subhead text-label-2">{subtitle}</span>
          ) : null}
        </span>
        {detail !== undefined ? (
          <span className="max-w-[60%] min-w-0 truncate text-right text-label-2">{detail}</span>
        ) : null}
        {accessory}
        {(chevron ?? (href ? true : false)) ? (
          <ChevronRight className="size-5 shrink-0 text-label-3" strokeWidth={2.4} aria-hidden />
        ) : null}
      </span>
    </>
  );
  const classes = cn(
    "group/row flex w-full items-center gap-3",
    interactive && "active:bg-fill-3 transition-colors",
    className,
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={classes}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}

/** A row with an iOS switch. */
export function SwitchRow({
  title,
  checked,
  onCheckedChange,
  disabled,
  icon,
}: {
  title: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <ListRow
      title={title}
      icon={icon}
      accessory={<Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />}
    />
  );
}

/** Shared layout of a row with a title and a trailing control. */
function ControlRow({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <span className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 pr-4 pl-4 hairline-b group-last/row:shadow-none">
      {/* Long (e.g. German) titles wrap instead of pushing the control out of the card. */}
      <span className="min-w-0 flex-1 leading-snug break-words">{title}</span>
      {children}
    </span>
  );
}

/** A row with a right-aligned input (numbers, short text). */
export function InputRow({
  title,
  suffix,
  className,
  ...props
}: { title: ReactNode; suffix?: ReactNode } & ComponentProps<"input">) {
  return (
    <label className="group/row flex w-full items-center">
      <ControlRow title={title}>
        <span className="flex max-w-[50%] min-w-0 shrink-0 items-center justify-end gap-0.5">
          <input
            className={cn(
              "w-20 min-w-0 bg-transparent text-right text-label-2 outline-none focus:text-label aria-invalid:text-ios-red",
              className,
            )}
            {...props}
          />
          {suffix ? <span className="shrink-0 text-label-2">{suffix}</span> : null}
        </span>
      </ControlRow>
    </label>
  );
}

/** A row with a native picker (rendered as right-aligned value text, like iOS menus). */
export function SelectRow({
  title,
  className,
  children,
  ...props
}: { title: ReactNode } & ComponentProps<"select">) {
  return (
    <label className="group/row flex w-full items-center">
      <ControlRow title={title}>
        <select
          className={cn(
            "max-w-[60%] min-w-0 truncate bg-transparent text-right text-label-2 outline-none [text-align-last:right]",
            className,
          )}
          {...props}
        >
          {children}
        </select>
      </ControlRow>
    </label>
  );
}

/** A row whose control sits below the title (segmented controls and other wide controls). */
export function StackedRow({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="group/row flex w-full">
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-2.5 pr-4 pl-4 hairline-b group-last/row:shadow-none">
        <span className="leading-snug">{title}</span>
        {children}
      </div>
    </div>
  );
}
