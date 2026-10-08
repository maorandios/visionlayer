"use client";

import type { SelectHTMLAttributes } from "react";

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select
      className={`min-h-10 w-full rounded-md border border-border bg-muted px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/40 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
