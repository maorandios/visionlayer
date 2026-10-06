"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  children: ReactNode;
};

const variants = {
  primary: "bg-ink text-surface hover:bg-ink/90",
  secondary: "bg-muted text-ink border border-border hover:bg-surface",
  ghost: "text-ink hover:bg-muted",
  danger: "bg-ink text-surface hover:bg-ink/80",
};

const sizes = {
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-xs",
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
