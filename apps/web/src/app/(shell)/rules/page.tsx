"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { objectClassHe } from "@/lib/format";
import { api } from "@/lib/api";
import type { Rule } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { t } from "@/i18n/he";

export default function RulesPage() {
  const { token } = useAuth();
  const { cameraName, zoneName, refresh: refreshCatalog } = useCatalog();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRules(await api.rules.list(token));
      await refreshCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [token, refreshCatalog]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(rule: Rule) {
    if (!token) return;
    await api.rules.update(token, rule.id, { enabled: !rule.enabled });
    await load();
  }

  async function dup(rule: Rule) {
    if (!token) return;
    await api.rules.duplicate(token, rule.id);
    await load();
  }

  async function remove(id: string) {
    if (!token || !confirm("למחוק את החוק?")) return;
    await api.rules.delete(token, id);
    await load();
  }

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{t("rulesTitle")}</h1>
        <Link href="/rules/new">
          <Button>{t("addRule")}</Button>
        </Link>
      </div>
      {rules.length === 0 ? (
        <EmptyBlock message={t("emptyRules")} />
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li key={rule.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/rules/${rule.id}`} className="font-medium text-ink">
                      {rule.name}
                    </Link>
                    <p className="mt-1 text-xs text-ink-muted">
                      {objectClassHe(rule.conditions.object_classes?.[0])} ·{" "}
                      {cameraName(rule.conditions.camera_id)} · {zoneName(rule.conditions.zone_id)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {rule.conditions.schedule
                        ? `${rule.conditions.schedule.from}–${rule.conditions.schedule.to}`
                        : "—"}{" "}
                      · {rule.conditions.min_duration_seconds ?? 0} {t("seconds")} ·{" "}
                      {rule.enabled ? t("enabled") : t("disabled")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => toggle(rule)}>
                      {rule.enabled ? t("disable") : t("enable")}
                    </Button>
                    <Button variant="secondary" onClick={() => dup(rule)}>
                      {t("duplicate")}
                    </Button>
                    <Button variant="ghost" onClick={() => remove(rule.id)}>
                      {t("delete")}
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
