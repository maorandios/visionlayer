"use client";

import type { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={`min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-ink ${className}`}
      {...rest}
    />
  );
}
