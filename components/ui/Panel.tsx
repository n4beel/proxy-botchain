"use client";

import { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  variant?: "surface" | "elevated" | "subtle";
}

export default function Panel({
  title,
  subtitle,
  badge,
  action,
  variant = "surface",
  children,
  className = "",
  style,
  ...props
}: PanelProps) {
  const bg =
    variant === "elevated"
      ? "var(--bg-elevated)"
      : variant === "subtle"
      ? "var(--bg-overlay)"
      : "var(--bg-surface)";

  const inlineStyle: CSSProperties = {
    backgroundColor: bg,
    border: "1px solid var(--border-default)",
    borderRadius: "4px",
    ...style,
  };

  return (
    <section className={`p-4 sm:p-5 relative ${className}`} style={inlineStyle} {...props}>
      {(title || subtitle || badge || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--border-subtle)]">
          <div>
            {title && (
              <h2 className="font-heading text-lg font-bold tracking-tight text-[var(--text-primary)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5 font-sans">
                {subtitle}
              </p>
            )}
          </div>
          {(badge || action) && (
            <div className="flex items-center gap-2">
              {badge}
              {action}
            </div>
          )}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}
