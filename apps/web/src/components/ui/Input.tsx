"use client";

import type { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={`min-h-10 w-full rounded-md border border-border bg-black/30 px-3 text-sm text-ink placeholder:text-ink-faint outline-none backdrop-blur-sm transition focus:border-accent focus:ring-1 focus:ring-accent/40 ${className}`}
      {...rest}
    />
  );
}
