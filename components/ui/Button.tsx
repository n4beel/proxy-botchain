"use client";

import { ButtonHTMLAttributes, CSSProperties, forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger" | "action";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantInlineStyles: Record<Variant, CSSProperties> = {
  primary: { background: "var(--accent)", color: "var(--accent-ink)" },
  action: { background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-default)" },
  ghost: { background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)" },
  danger: { background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)" },
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs font-semibold tracking-wide",
  md: "px-5 py-2.5 text-sm font-semibold tracking-wide",
  lg: "px-6 py-3.5 text-base font-bold tracking-wider",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, disabled, children, className = "", style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2 select-none",
          "font-heading uppercase transition-all duration-150 active:translate-y-px",
          "cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0",
          sizeStyles[size],
          className,
        ].join(" ")}
        style={{ borderRadius: "3px", ...variantInlineStyles[variant], ...style }}
        {...props}
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
