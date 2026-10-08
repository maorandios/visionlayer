"use client";

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
  id?: string;
  className?: string;
  "data-testid"?: string;
  "data-rule-id"?: string;
};

/**
 * Elegant dark VisionLayer switch — charcoal track, soft cream knob, no green.
 * Forced LTR so ON = knob on the right regardless of page RTL.
 * Knob is vertically centered via inset-block + fixed size (no top offset drift).
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  className = "",
  "aria-label": ariaLabel,
  "data-testid": testId,
  "data-rule-id": ruleId,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      dir="ltr"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      data-testid={testId}
      data-rule-id={ruleId}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onCheckedChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border box-border transition-[background-color,border-color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25 disabled:cursor-wait disabled:opacity-50 ${className}`}
      style={{
        backgroundColor: checked ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.35)",
        borderColor: checked ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.12)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-full transition-transform duration-200 ease-out"
        style={{
          width: 16,
          height: 16,
          top: "50%",
          left: 3,
          marginTop: -8,
          transform: checked ? "translateX(1.25rem)" : "translateX(0)",
          backgroundColor: checked ? "rgba(232, 224, 212, 0.88)" : "rgba(110, 116, 128, 0.85)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxSizing: "border-box",
        }}
      />
    </button>
  );
}
