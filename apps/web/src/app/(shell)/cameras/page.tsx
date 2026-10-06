"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { cameraStatusHe } from "@/lib/format";
import { api } from "@/lib/api";
import type { Camera } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

export default function CamerasPage() {
  const { token } = useAuth();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (cam.enabled) await api.cameras.disable(token, cam.id);
    else await api.cameras.enable(token, cam.id);
    await load();
  }

  async function remove(id: string) {
    if (!token || !confirm("למחוק את המצלמה?")) return;
    await api.cameras.delete(token, id);
    await load();
  }

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink">{t("camerasTitle")}</h1>
        <Link href="/cameras/new">
          <Button>{t("addCamera")}</Button>
        </Link>
      </div>
      {cameras.length === 0 ? (
        <EmptyBlock message={t("emptyCameras")} />
      ) : (
        <ul className="space-y-3">
          {cameras.map((cam) => (
            <li key={cam.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/cameras/${cam.id}`} className="text-base font-medium text-ink">
                      {cam.name}
                    </Link>
                    <p className="text-xs text-ink-muted">{cam.location ?? "—"}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {cam.enabled ? t("enabled") : t("disabled")} · {cameraStatusHe(cam.status)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/cameras/${cam.id}/edit`}>
                      <Button variant="secondary">{t("edit")}</Button>
                    </Link>
                    <Button variant="secondary" onClick={() => toggle(cam)}>
                      {cam.enabled ? t("disable") : t("enable")}
                    </Button>
                    <Button variant="ghost" onClick={() => remove(cam.id)}>
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
