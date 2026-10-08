"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AddCameraWizard } from "@/components/cameras/AddCameraWizard";
import { MetricWizard } from "@/components/metrics/wizard/MetricWizard";
import { RuleWizard } from "@/components/rules/wizard/RuleWizard";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/he";
import { markSetupComplete } from "@/lib/setup-storage";
import { useCatalog } from "@/providers/CatalogProvider";

type Phase = "welcome" | "camera" | "camera_done" | "metric" | "rule" | "done";

/**
 * Lightweight first-run: welcome → camera → optional metric → optional rule → done.
 * Reuses Add Camera / Metric / Rule wizards — no duplicate builders.
 */
export function SetupFlow() {
  const router = useRouter();
  const { cameras, rules, refresh, zonesForCamera, linesForCamera } = useCatalog();
  const [phase, setPhase] = useState<Phase>("welcome");
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [metricCount, setMetricCount] = useState(0);
  const [ruleCreated, setRuleCreated] = useState(false);

  const finish = useCallback(
    (goCamera: boolean) => {
      markSetupComplete();
      void refresh();
      if (goCamera && cameraId) router.replace(`/?camera=${cameraId}`);
      else router.replace("/");
    },
    [cameraId, refresh, router],
  );

  const skipToEnd = () => {
    markSetupComplete();
    setPhase("done");
  };

  const summary = useMemo(() => {
    const cams = cameraId ? 1 : cameras.length;
    const rulesN = ruleCreated ? 1 : 0;
    return { cams, metrics: metricCount, rules: rulesN || rules.filter((r) => r.conditions.camera_id === cameraId).length };
  }, [cameraId, cameras.length, metricCount, ruleCreated, rules]);

  if (phase === "welcome") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center" data-testid="setup-welcome">
        <h1 className="text-2xl font-semibold text-ink">{t("setupWelcomeTitle")}</h1>
        <p className="text-sm leading-relaxed text-ink-muted">{t("setupWelcomeBody")}</p>
        <Button onClick={() => setPhase("camera")} data-testid="setup-start">
          {t("setupStart")}
        </Button>
        <button
          type="button"
          className="text-xs text-ink-faint underline-offset-2 hover:underline"
          onClick={() => {
            markSetupComplete();
            router.replace("/");
          }}
          data-testid="setup-skip-all"
        >
          {t("setupSkipAll")}
        </button>
      </div>
    );
  }

  if (phase === "camera") {
    return (
      <AddCameraWizard
        embedded
        onDone={(id) => {
          setCameraId(id);
          setPhase("camera_done");
        }}
        onCancel={() => setPhase("welcome")}
      />
    );
  }

  if (phase === "camera_done") {
    return (
      <div className="mx-auto max-w-md space-y-5 py-12 text-center" data-testid="setup-camera-done">
        <h2 className="text-xl font-semibold text-ink">{t("setupCameraAdded")}</h2>
        <p className="text-sm text-ink-muted">{t("setupMetricAsk")}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => setPhase("metric")} data-testid="setup-metric-next">
            {t("continue")}
          </Button>
          <Button variant="secondary" onClick={() => setPhase("rule")} data-testid="setup-metric-skip">
            {t("setupSkipForNow")}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "metric" && cameraId) {
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="setup-metric">
        <header className="space-y-1 text-center">
          <h2 className="text-lg font-semibold text-ink">{t("setupMetricAsk")}</h2>
          <button type="button" className="text-xs text-ink-muted underline-offset-2 hover:underline" onClick={() => setPhase("rule")}>
            {t("setupSkipForNow")}
          </button>
        </header>
        <MetricWizard
          cameraId={cameraId}
          zones={zonesForCamera(cameraId)}
          lines={linesForCamera(cameraId)}
          onExit={() => setPhase("rule")}
          onSaved={() => {
            setMetricCount((n) => n + 1);
            void refresh();
            setPhase("rule");
          }}
        />
      </div>
    );
  }

  if (phase === "rule" && cameraId) {
    return (
      <div className="flex min-h-[70vh] flex-col" data-testid="setup-rule">
        <div className="mx-auto w-full max-w-md space-y-3 px-4 py-4 text-center">
          <h2 className="text-lg font-semibold text-ink">{t("setupRuleAsk")}</h2>
          <p className="text-sm text-ink-muted">{t("setupRuleHint")}</p>
          <Button variant="secondary" size="sm" onClick={skipToEnd} data-testid="setup-rule-skip">
            {t("setupSkip")}
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <RuleWizard
            mode="create"
            presetCameraId={cameraId}
            embedded
            onExit={skipToEnd}
            onSaved={() => {
              setRuleCreated(true);
              markSetupComplete();
              setPhase("done");
            }}
          />
        </div>
      </div>
    );
  }

  // done
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-16 text-center" data-testid="setup-done">
      <h1 className="text-2xl font-semibold text-ink">{t("setupDoneTitle")}</h1>
      <ul className="space-y-1 text-sm text-ink-muted">
        <li>
          {summary.cams === 1 ? "מצלמה אחת" : `${summary.cams} מצלמות`}
        </li>
        <li>
          {summary.metrics === 0 ? "ללא מדדים" : summary.metrics === 1 ? "מדד אחד" : `${summary.metrics} מדדים`}
        </li>
        <li>
          {summary.rules === 0 ? "ללא חוקים" : summary.rules === 1 ? "חוק אחד" : `${summary.rules} חוקים`}
        </li>
      </ul>
      <Button onClick={() => finish(true)} data-testid="setup-open-camera">
        {t("setupOpenCamera")}
      </Button>
      <Link href="/" className="text-xs text-ink-faint underline-offset-2 hover:underline" onClick={() => markSetupComplete()}>
        {t("setupGoHome")}
      </Link>
    </div>
  );
}
