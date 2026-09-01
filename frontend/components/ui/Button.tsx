"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button — four intents, four sizes, one radius.
 *
 * Colour is reserved: only `primary` (the cobalt accent) and `danger` carry
 * hue. Everything else is neutral, so a coloured button always means "this is
 * the action".
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "xs" | "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active border border-transparent",
  secondary:
    "bg-surface text-primary border border-border hover:bg-subtle hover:border-border-strong",
  ghost:
    "bg-transparent text-secondary border border-transparent hover:bg-subtle hover:text-primary",
  danger:
    "bg-failed-bg text-failed border border-failed-border hover:bg-failed hover:text-white hover:border-failed",
};

const SIZES: Record<Size, string> = {
  xs: "h-control-xs px-2 text-caption gap-1",
  sm: "h-control-sm px-2.5 text-small gap-1.5",
  md: "h-control px-3 text-body gap-1.5",
  lg: "h-control-lg px-4 text-body gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, trailing, full, className = "", children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={props.type ?? "button"}
      className={[
        "inline-flex items-center justify-center rounded font-medium",
        "transition-colors duration-instant ease-standard",
        "disabled:pointer-events-none disabled:opacity-40",
        "whitespace-nowrap select-none",
        VARIANTS[variant],
        SIZES[size],
        full ? "w-full" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {icon && <span className="shrink-0 opacity-80">{icon}</span>}
      {children}
      {trailing && <span className="shrink-0 opacity-60">{trailing}</span>}
    </button>
  );
});

/** Keyboard shortcut hint. Mono is legitimate here. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-border bg-subtle px-1 font-mono text-[10px] font-medium text-tertiary">
      {children}
    </kbd>
  );
}
