"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { api } from "@/lib/api";
import type { Camera, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useEvents } from "@/providers/EventsProvider";
import { t } from "@/i18n/he";

const SCENARIOS = [
  { id: "person_enter_zone", labelKey: "scenarioPersonEnter" as const },
  { id: "person_loiter_zone", labelKey: "scenarioPersonLoiter" as const },
  { id: "person_leave_zone", labelKey: "scenarioPersonLeave" as const },
  { id: "truck_enter_zone", labelKey: "scenarioTruckEnter" as const },
] as const;

export default function DevSimulatePage() {
  const { token, hub } = useAuth();
  const { refresh } = useEvents();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [scenario, setScenario] = useState<string>("person_enter_zone");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (hub && !hub.features?.simulate_detections) {
      setError("סימולציה כבויה");
      setLoading(false);
      return;
    }
    if (!token) return;
    (async () => {
      try {
        const cams = await api.cameras.list(token);
        setCameras(cams);
        if (cams[0]) setCameraId(cams[0].id);
        const all: Zone[] = [];
        for (const c of cams) all.push(...(await api.zones.listForCamera(token, c.id)));
        setZones(all);
        const firstForCam = all.find((z) => z.camera_id === cams[0]?.id);
        if (firstForCam) setZoneId(firstForCam.id);
        else if (all[0]) setZoneId(all[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errorLoad"));
      } finally {
        setLoading(false);
      }
    })();
  }, [token, hub]);

  const filteredZones = zones.filter((z) => z.camera_id === cameraId);

  async function run() {
    if (!token || !cameraId || !zoneId) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      await api.simulate.scenario(token, {
        scenario,
        camera_id: cameraId,
        zone_id: zoneId,
        duration_seconds: 35,
      });
      setResult(t("simulateSuccess"));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <LoadingBlock />;
  if (error && !cameras.length) return <ErrorBlock message={error} />;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-border bg-muted">
          <FlaskConical className="h-5 w-5 text-ink-muted" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-ink">{t("devSimulate")}</h1>
          <p className="text-xs text-ink-muted">{t("devSimulateHint")}</p>
        </div>
      </div>

      <Card className="space-y-3">
        <Field label={t("scenario")}>
          <Select value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {t(s.labelKey)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("navCameras")}>
          <Select
            value={cameraId}
            onChange={(e) => {
              const next = e.target.value;
              setCameraId(next);
              const z = zones.find((item) => item.camera_id === next);
              setZoneId(z?.id ?? "");
            }}
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="אזור">
          <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {filteredZones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </Field>
        {error ? <p className="text-sm text-ink">{error}</p> : null}
        <Button className="w-full" onClick={run} disabled={running || !zoneId}>
          {running ? t("loading") : t("simulateRun")}
        </Button>
        {result ? (
          <div className="space-y-2">
            <p className="text-sm text-ink">{result}</p>
            <Link href="/events" className="text-sm text-ink underline">
              {t("navEvents")}
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-ink-muted">{label}</label>
      {children}
    </div>
  );
}
