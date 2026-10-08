"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import type { CameraAiTestStatus } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";

type Props = {
  cameraId: string;
  onNeedMetric?: () => void;
  onNeedRule?: () => void;
  /** Called when a run completes successfully — refresh Activity/Events. */
  onRunComplete?: (runId: string) => void;
  /** Latest successful run id for parent scoping. */
  onStatus?: (status: CameraAiTestStatus) => void;
};

function formatLastTest(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Camera-level AI Test control — only for test-video sources.
 * Reuses Video Lab analysis pipeline via POST /cameras/{id}/ai-test.
 */
export function CameraAiTestBar({
  cameraId,
  onNeedMetric,
  onNeedRule,
  onRunComplete,
  onStatus,
}: Props) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [status, setStatus] = useState<CameraAiTestStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return null;
    try {
      const s = await api.cameras.aiTestStatus(token, cameraId);
      setStatus(s);
      onStatus?.(s);
      return s;
    } catch {
      return null;
    }
  }, [token, cameraId, onStatus]);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    const running = status?.active_job?.status === "running";
    if (!running) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(() => {
      void (async () => {
        const s = await refresh();
        if (!s?.active_job && s?.latest_job) {
          if (s.latest_job.status === "completed" && s.latest_successful_run) {
            showToast(t("aiTestDoneToast"));
            onRunComplete?.(s.latest_successful_run.id);
          } else if (s.latest_job.status === "failed") {
            setError(t("aiTestFailed"));
          }
        }
      })();
    }, 800);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status?.active_job?.status, refresh, showToast, onRunComplete]);

  async function start() {
    if (!token) return;
    if (status && !status.has_rules_or_metrics) {
      setGateOpen(true);
      return;
    }
    setGateOpen(false);
    setError(null);
    setStarting(true);
    try {
      await api.cameras.aiTest(token, cameraId);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("aiTestFailed");
      if (msg.includes("מקור הסרטון")) setError(t("aiTestSourceMissing"));
      else if (msg.includes("מדדים או חוקים")) setGateOpen(true);
      else setError(t("aiTestFailed"));
    } finally {
      setStarting(false);
    }
  }

  if (status && !status.supports_manual_analysis) return null;

  const running = status?.active_job?.status === "running" || starting;
  const progress = status?.active_job?.progress;
  const pct = typeof progress?.percent === "number" ? Math.round(progress.percent) : null;
  const framesDone = progress?.frames_done;
  const framesTotal = progress?.frames_total;
  const last = status?.latest_successful_run;
  const failed =
    !running && status?.latest_job?.status === "failed" && status.latest_job.id !== last?.id;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface/40 px-3 py-2.5" data-testid="camera-ai-test">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[11px] text-ink-muted">{t("testSourceBadge")}</p>
          {running ? (
            <p className="text-sm font-medium text-ink" data-testid="ai-test-running">
              {pct != null ? `${t("aiTestRunning")} ${pct}%` : t("aiTestRunningIndeterminate")}
            </p>
          ) : last ? (
            <p className="text-xs text-ink-muted">
              {t("aiTestLastLabel")}: {formatLastTest(last.analyzed_at)}
              {last.events_total > 0 ? ` · ${last.events_total} ${t("eventsShort")}` : null}
            </p>
          ) : (
            <p className="text-xs text-ink-faint">{t("aiTestNeverRun")}</p>
          )}
          {running && framesDone != null && framesTotal != null && framesTotal > 0 ? (
            <p className="text-[11px] text-ink-faint" dir="ltr">
              {framesDone} / {framesTotal}
            </p>
          ) : null}
          {!running && status?.config_changed_since_last_run && last ? (
            <p className="text-[11px] text-warning">{t("aiTestConfigChanged")}</p>
          ) : null}
          {failed || error ? (
            <p className="text-[11px] text-danger" data-testid="ai-test-error">
              {error ?? t("aiTestFailed")}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          onClick={() => void start()}
          disabled={running}
          data-testid="ai-test-start"
        >
          {running ? t("aiTestRunning") : t("aiTestCta")}
        </Button>
      </div>

      {gateOpen ? (
        <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2" data-testid="ai-test-gate">
          <p className="text-sm font-medium text-ink">{t("aiTestNoConfigTitle")}</p>
          <p className="text-xs text-ink-muted">{t("aiTestNoConfigBody")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onNeedMetric?.()}>
              {t("addMetricCta")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onNeedRule?.()}>
              {t("createRuleCta")}
            </Button>
          </div>
        </div>
      ) : null}

      {running && pct != null ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      ) : running ? (
        <div className="h-1 w-full animate-pulse rounded-full bg-accent/40" aria-hidden />
      ) : null}
    </div>
  );
}
