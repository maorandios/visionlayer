"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  children: ReactNode;
};

const variants = {
  primary: "bg-ink text-surface hover:bg-ink/90",
  secondary: "bg-muted text-ink border border-border hover:bg-surface",
  ghost: "text-ink hover:bg-muted",
  danger: "bg-ink text-surface hover:bg-ink/80",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
