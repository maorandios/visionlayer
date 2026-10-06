"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RuleCard } from "@/components/rules/RuleCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { Tabs } from "@/components/ui/Tabs";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { TRIGGER_FILTERS, describeRule, triggerKind, type TriggerKind } from "@/lib/rule-describe";
import type { Rule } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";

type StateFilter = "all" | "active" | "disabled";

export default function RulesPage() {
  const { token } = useAuth();
  const { cameras, ruleNames, refresh: refreshCatalog } = useCatalog();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [cameraFilter, setCameraFilter] = useState<string>("");
  const [triggerFilter, setTriggerFilter] = useState<"all" | TriggerKind>("all");
  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);

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

  async function remove() {
    if (!token || !pendingDelete) return;
    await api.rules.delete(token, pendingDelete.id);
    setPendingDelete(null);
    await load();
  }

  const counts = useMemo(
    () => ({
      all: rules.length,
      active: rules.filter((r) => r.enabled).length,
      disabled: rules.filter((r) => !r.enabled).length,
    }),
    [rules],
  );

  const visible = useMemo(
    () =>
      rules.filter((r) => {
        if (stateFilter === "active" && !r.enabled) return false;
        if (stateFilter === "disabled" && r.enabled) return false;
        if (cameraFilter && r.conditions.camera_id !== cameraFilter) return false;
        if (triggerFilter !== "all" && triggerKind(r) !== triggerFilter) return false;
        return true;
      }),
    [rules, stateFilter, cameraFilter, triggerFilter],
  );

  if (loading && rules.length === 0) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("rulesTitle")}
        subtitle={t("rulesSubtitle")}
        actions={
          <Link href="/rules/new">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("addRule")}
            </Button>
          </Link>
        }
      />

      {rules.length > 0 ? (
        <div className="space-y-2" data-testid="rules-filters">
          <Tabs
            size="sm"
            ariaLabel={t("state")}
            value={stateFilter}
            onChange={setStateFilter}
            items={[
              { id: "all", label: t("filterAll"), count: counts.all },
              { id: "active", label: t("filterActive"), count: counts.active },
              { id: "disabled", label: t("filterDisabled"), count: counts.disabled },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              aria-label={t("camera")}
              value={cameraFilter}
              onChange={(e) => setCameraFilter(e.target.value)}
            >
              <option value="">{t("allCameras")}</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t("when")}
              value={triggerFilter}
              onChange={(e) => setTriggerFilter(e.target.value as "all" | TriggerKind)}
            >
              {TRIGGER_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      {rules.length === 0 ? (
        <EmptyBlock
          message={t("emptyRules")}
          hint={t("rulesSubtitle")}
          action={
            <Link href="/rules/new">
              <Button>{t("addRule")}</Button>
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyBlock message={t("noRulesMatch")} />
      ) : (
        <ul className="space-y-3">
          {visible.map((rule) => (
            <li key={rule.id}>
              <RuleCard
                rule={rule}
                description={describeRule(rule, ruleNames)}
                actions={
                  <>
                    <Button variant="secondary" size="sm" onClick={() => toggle(rule)}>
                      {rule.enabled ? t("disable") : t("enable")}
                    </Button>
                    <Link href={`/rules/${rule.id}`}>
                      <Button variant="secondary" size="sm">
                        {t("edit")}
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => dup(rule)}>
                      {t("duplicate")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(rule)}>
                      {t("delete")}
                    </Button>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("deleteRule")}
        description={pendingDelete ? `${pendingDelete.name} — ${t("ruleDeleteConfirm")}` : undefined}
        onConfirm={remove}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
