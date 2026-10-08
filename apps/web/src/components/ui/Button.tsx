"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  children: ReactNode;
};

const variants = {
  primary:
    "bg-accent text-ink-on-accent hover:bg-accent-hover shadow-soft font-semibold",
  secondary:
    "bg-white/5 text-ink border border-border backdrop-blur-sm hover:border-white/20 hover:bg-white/10",
  ghost: "text-ink-muted hover:bg-white/5 hover:text-ink",
  danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/25",
};

const sizes = {
  md: "min-h-10 px-4 text-sm",
  sm: "min-h-8 px-3 text-xs",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
