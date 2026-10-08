"use client";

import { MoreVertical } from "lucide-react";
import { memo, useEffect, useId, useRef, useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { t } from "@/i18n/he";
import {
  ruleBehaviorIcon,
  ruleDisplayName,
  ruleObjectLine,
  type RuleNames,
} from "@/lib/rule-describe";
import type { Rule } from "@/lib/types";

type Props = {
  rule: Rule;
  /** Primitive — must come from THIS rule only. */
  enabled: boolean;
  names: RuleNames;
  onOpen: (ruleId: string) => void;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onEdit: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
  toggling?: boolean;
};

/**
 * Compact operational Rule row.
 * Toggle is bound only to `rule.id` + `enabled` primitives — never shared list state.
 */
function RuleListRowInner({
  rule,
  enabled,
  names,
  onOpen,
  onToggle,
  onEdit,
  onDelete,
  toggling = false,
}: Props) {
  const Icon = ruleBehaviorIcon(rule);
  const title = ruleDisplayName(rule, names);
  const objectLine = ruleObjectLine(rule);
  const toggleId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const ruleId = rule.id;

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <li
      data-testid="rule-list-row"
      data-rule-id={ruleId}
      data-enabled={enabled ? "true" : "false"}
      className={`group border-b border-white/[0.06] last:border-b-0 ${enabled ? "" : "opacity-75"}`}
    >
      <div className="flex flex-col gap-2.5 px-1 py-3.5 transition-colors hover:bg-white/[0.035] sm:flex-row sm:items-center sm:gap-3 sm:py-3.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-start focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
          onClick={() => onOpen(ruleId)}
          data-testid="rule-row-open"
          aria-label={`${t("edit")}: ${title}`}
        >
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] ${
              enabled ? "text-ink-muted group-hover:text-accent" : "text-ink-faint"
            }`}
            aria-hidden
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.85} />
          </span>

          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200 ${
                  enabled
                    ? "bg-success shadow-[0_0_6px_var(--color-success)]"
                    : "bg-accent shadow-[0_0_6px_var(--color-accent)]"
                }`}
                title={enabled ? t("enabled") : t("ruleOff")}
                data-testid="rule-status-dot"
                aria-hidden
              />
              <span className="truncate text-[13px] font-semibold leading-snug text-ink">{title}</span>
            </span>

            <span className="block truncate text-[11px] leading-snug text-ink-muted" data-testid="rule-row-object">
              <span className="text-ink-faint">{t("ruleObjectLabel")}: </span>
              {objectLine}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center justify-between gap-3 ps-10 sm:justify-end sm:ps-0">
          <div className="flex items-center gap-2">
            <span
              className={`min-w-[2.5rem] text-[11px] ${enabled ? "text-ink-muted" : "text-ink-faint"}`}
              data-testid="rule-state-label"
            >
              {enabled ? t("enabled") : t("ruleOff")}
            </span>
            <Switch
              id={toggleId}
              checked={enabled}
              disabled={toggling}
              aria-label={enabled ? t("disableRuleAria") : t("enableRuleAria")}
              data-testid="rule-enabled-toggle"
              data-rule-id={ruleId}
              onCheckedChange={(next) => onToggle(ruleId, next)}
            />
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label={t("ruleMenu")}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              data-testid="rule-row-menu"
              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-white/5 hover:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              <MoreVertical className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="glass-strong absolute end-0 top-10 z-20 min-w-[9.5rem] rounded-lg py-1 shadow-float"
                data-testid="rule-row-menu-panel"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-start text-sm text-ink hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(ruleId);
                  }}
                >
                  {t("edit")}
                </button>
                <div className="my-1 border-t border-white/[0.06]" aria-hidden />
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-start text-sm text-danger hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(ruleId);
                  }}
                >
                  {t("delete")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export const RuleListRow = memo(RuleListRowInner, (prev, next) => {
  return (
    prev.rule.id === next.rule.id &&
    prev.enabled === next.enabled &&
    prev.toggling === next.toggling &&
    prev.rule.name === next.rule.name &&
    prev.rule.updated_at === next.rule.updated_at &&
    prev.names === next.names &&
    prev.onOpen === next.onOpen &&
    prev.onToggle === next.onToggle &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete
  );
});
RuleListRow.displayName = "RuleListRow";
