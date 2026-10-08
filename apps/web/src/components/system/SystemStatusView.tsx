"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { t } from "@/i18n/he";
import { isDevEnvironment } from "@/lib/navigation";
import {
  fetchSystemHealth,
  levelLabelHe,
  type HealthLevel,
  type SystemHealthSnapshot,
} from "@/lib/system-health";
import { useAuth } from "@/providers/AuthProvider";

function levelDot(level: HealthLevel): string {
  switch (level) {
    case "ok":
      return "bg-success shadow-[0_0_6px_var(--color-success)]";
    case "attention":
      return "bg-warning";
    case "down":
      return "bg-danger/80";
  }
}

export function SystemStatusView() {
  const { token, hub } = useAuth();
  const [snap, setSnap] = useState<SystemHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [techOpen, setTechOpen] = useState(false);
  const showTech = isDevEnvironment(hub);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const s = await fetchSystemHealth(token, hub);
      setSnap(s);
    } catch {
      setError(true);
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, [token, hub]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !snap) return <LoadingBlock />;
  if (error && !snap) return <ErrorBlock message={t("errorLoad")} onRetry={load} />;
  if (!snap) return null;

  return (
    <div className="mx-auto max-w-lg space-y-5" data-testid="system-status">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-ink">{t("systemStatusTitle")}</h1>
        <p className="flex items-center gap-2 text-sm text-ink-muted" data-testid="system-status-headline">
          <span className={`inline-block h-2 w-2 rounded-full ${levelDot(snap.level)}`} aria-hidden />
          {snap.headline}
        </p>
      </header>

      <ul className="glass-panel divide-y divide-border overflow-hidden rounded-xl">
        {snap.rows.map((row) => {
          const open = openRow === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-white/[0.03]"
                onClick={() => setOpenRow(open ? null : row.id)}
                data-testid={`system-status-row-${row.id}`}
              >
                <span className="text-sm text-ink">{row.label}</span>
                <span className="flex items-center gap-2 text-sm text-ink-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${levelDot(row.level)}`} aria-hidden />
                  {row.detail}
                  <span className="text-[11px] text-ink-faint">{levelLabelHe(row.level)}</span>
                </span>
              </button>
              {open && row.explanation ? (
                <p className="border-t border-border/60 bg-muted/30 px-4 py-2 text-xs text-ink-muted">{row.explanation}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {showTech ? (
        <div className="rounded-xl border border-dashed border-border" data-testid="system-status-tech">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-sm text-ink-muted"
            onClick={() => setTechOpen((v) => !v)}
          >
            {t("systemTechDetails")}
            {techOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {techOpen ? (
            <dl className="space-y-1 border-t border-border px-4 py-3 text-xs text-ink-muted">
              {snap.technical.map((item) => (
                <div key={item.label} className="flex justify-between gap-3">
                  <dt>{item.label}</dt>
                  <dd className="font-mono text-ink-faint" dir="ltr">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
