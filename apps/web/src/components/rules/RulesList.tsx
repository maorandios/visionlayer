"use client";

import { Plus } from "lucide-react";
import { useCallback, useMemo } from "react";
import { RuleListRow } from "@/components/rules/RuleListRow";
import { Button } from "@/components/ui/Button";
import { EmptyBlock } from "@/components/ui/StateBlock";
import { t } from "@/i18n/he";
import { sortRulesOperational, type RuleNames } from "@/lib/rule-describe";
import type { Rule } from "@/lib/types";

type Props = {
  rules: Rule[];
  names: RuleNames;
  onCreate: () => void;
  onOpen: (ruleId: string) => void;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onEdit: (ruleId: string) => void;
  onDelete: (ruleId: string) => void;
  togglingId?: string | null;
};

/**
 * Camera-scoped operational Rules list — no outer card chrome.
 * Each row receives its own `enabled` primitive from `rule.id` only.
 */
export function RulesList({
  rules,
  names,
  onCreate,
  onOpen,
  onToggle,
  onEdit,
  onDelete,
  togglingId = null,
}: Props) {
  const sorted = useMemo(() => sortRulesOperational(rules), [rules]);
  const activeCount = rules.filter((r) => r.enabled).length;
  const disabledCount = rules.length - activeCount;

  const handleToggle = useCallback(
    (ruleId: string, enabled: boolean) => {
      onToggle(ruleId, enabled);
    },
    [onToggle],
  );

  if (rules.length === 0) {
    return (
      <div className="space-y-3" data-testid="camera-tab-rules">
        <EmptyBlock
          message={t("rulesEmptyTitle")}
          hint={t("rulesEmptyHint")}
          action={
            <Button onClick={onCreate} data-testid="rules-create-first">
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("createFirstRule")}
            </Button>
          }
        />
      </div>
    );
  }

  const summary =
    disabledCount > 0
      ? `${activeCount} פעילים · ${disabledCount} כבוי`
      : activeCount === 1
        ? "חוק אחד פעיל"
        : `${activeCount} חוקים פעילים`;

  return (
    <div className="space-y-3" data-testid="camera-tab-rules">
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="rules-toolbar">
        <p className="text-xs text-ink-muted" data-testid="rules-summary">
          {summary}
        </p>
        <Button size="sm" onClick={onCreate} data-testid="rules-create">
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {t("createRuleCta")}
        </Button>
      </div>

      <ul className="list-none" data-testid="rules-list">
        {sorted.map((rule) => (
          <RuleListRow
            key={rule.id}
            rule={rule}
            enabled={rule.enabled === true}
            names={names}
            onOpen={onOpen}
            onToggle={handleToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            toggling={togglingId === rule.id}
          />
        ))}
      </ul>
    </div>
  );
}
