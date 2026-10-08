"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { t } from "@/i18n/he";
import type { RuleDescription } from "@/lib/rule-describe";
import type { Rule } from "@/lib/types";
import type { ReactNode } from "react";

/**
 * Human-readable rule card:
 *   שם החוק                              [פעיל]
 *   כאשר:  רכב חוצה את "שער A" בכיוון כניסה
 *   איפה:  חניון ראשי      מתי: 08:00–18:00
 *   פעולה: שליחת התראה
 */
export function RuleCard({
  rule,
  description,
  actions,
  showCamera = true,
}: {
  rule: Rule;
  description: RuleDescription;
  actions?: ReactNode;
  showCamera?: boolean;
}) {
  return (
    <Card data-testid="rule-card" className={rule.enabled ? "" : "opacity-70"}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/rules/${rule.id}`} className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{rule.name}</p>
        </Link>
        <Chip tone={rule.enabled ? "success" : "outline"}>{rule.enabled ? t("enabled") : t("disabled")}</Chip>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-ink-muted">{t("when")}:</dt>
          <dd className="text-ink">{description.when}</dd>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          {showCamera ? (
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 text-ink-muted">{t("whereLabel")}:</dt>
              <dd className="text-ink">{description.where}</dd>
            </div>
          ) : null}
          {description.schedule ? (
            <div className="flex gap-2">
              <dt className="shrink-0 text-ink-muted">{t("scheduleLabel")}:</dt>
              <dd className="text-ink" dir="ltr">
                {description.schedule}
              </dd>
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-ink-muted">{t("actionLabel")}:</dt>
          <dd className="text-ink">{description.action}</dd>
        </div>
      </dl>
      {actions ? <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div> : null}
    </Card>
  );
}
