"use client";

import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { cameraStatusHe } from "@/lib/format";
import type { Camera } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { isVirtualCamera, useCatalog } from "@/providers/CatalogProvider";

export default function CamerasPage() {
  const { token } = useAuth();
  const { zonesForCamera, linesForCamera, rulesForCamera, refresh: refreshCatalog } = useCatalog();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setCameras(await api.cameras.list(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(cam: Camera) {
    if (!token) return;
    setBusyId(cam.id);
    try {
      if (cam.enabled) await api.cameras.disable(token, cam.id);
      else await api.cameras.enable(token, cam.id);
      await Promise.all([load(), refreshCatalog()]);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && cameras.length === 0) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={load} />;

  const real = cameras.filter((c) => !isVirtualCamera(c));
  const virtual = cameras.filter((c) => isVirtualCamera(c));

  const renderCard = (cam: Camera) => {
    const zones = zonesForCamera(cam.id).length;
    const lines = linesForCamera(cam.id).length;
    const activeRules = rulesForCamera(cam.id).filter((r) => r.enabled).length;
    const virtualCam = isVirtualCamera(cam);
    return (
      <li key={cam.id}>
        <Card className={`p-0 ${virtualCam ? "border-dashed" : ""}`} data-testid="camera-card">
          <Link href={`/cameras/${cam.id}`} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-medium text-ink">{cam.name}</p>
                <Chip tone={cam.enabled ? "solid" : "outline"}>{cam.enabled ? t("enabled") : t("disabled")}</Chip>
                {virtualCam ? <Chip tone="dashed">{t("devSourceBadge")}</Chip> : null}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {cam.location ?? "—"} · {cameraStatusHe(cam.status)}
              </p>
              <p className="mt-2 text-xs text-ink-muted">
                {zones} {t("zonesCount")} · {lines} {t("linesCount")} · {activeRules} {t("activeRulesCount")}
              </p>
            </div>
            <ChevronLeft className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} aria-hidden />
          </Link>
          <div className="flex gap-2 border-t border-border px-4 py-2">
            <Button variant="ghost" size="sm" onClick={() => toggle(cam)} disabled={busyId === cam.id}>
              {cam.enabled ? t("disable") : t("enable")}
            </Button>
            <Link href={`/cameras/${cam.id}?tab=rules`}>
              <Button variant="ghost" size="sm">
                {t("cameraRules")}
              </Button>
            </Link>
            <Link href={`/cameras/${cam.id}?tab=zones`}>
              <Button variant="ghost" size="sm">
                {t("cameraZonesLines")}
              </Button>
            </Link>
          </div>
        </Card>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("camerasTitle")}
        actions={
          <Link href="/cameras/new">
            <Button>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("addCamera")}
            </Button>
          </Link>
        }
      />
      {cameras.length === 0 ? (
        <EmptyBlock
          message={t("emptyCameras")}
          action={
            <Link href="/cameras/new">
              <Button>{t("addCamera")}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">{real.map(renderCard)}</ul>
          {virtual.length > 0 ? (
            <section className="border-t border-dashed border-border pt-4" data-testid="virtual-cameras">
              <p className="mb-2 text-xs font-medium text-ink-muted">{t("virtualCamera")}</p>
              <ul className="space-y-3">{virtual.map(renderCard)}</ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
