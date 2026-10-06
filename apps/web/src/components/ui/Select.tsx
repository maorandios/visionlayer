"use client";

import type { SelectHTMLAttributes } from "react";

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select
      className={`min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-ink ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
