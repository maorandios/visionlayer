"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { api } from "@/lib/api";
import type { Camera, Line, Rule, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

export default function CameraDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [camera, setCamera] = useState<Camera | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const id = params.id;
      const [cam, z, ln, r] = await Promise.all([
        api.cameras.get(token, id),
        api.zones.listForCamera(token, id),
        api.lines.listForCamera(token, id),
        api.rules.list(token),
      ]);
      setCamera(cam);
      setZones(z);
      setLines(ln);
      setRules(r.filter((rule) => rule.conditions.camera_id === id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const preview = useMemo(
    () => (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-border bg-muted text-sm text-ink-muted">
        {t("previewPlaceholder")}
      </div>
    ),
    [],
  );

  if (loading) return <LoadingBlock />;
  if (error || !camera) return <ErrorBlock message={error ?? t("errorLoad")} onRetry={load} />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{camera.name}</h1>
          <p className="text-sm text-ink-muted">{camera.location ?? "—"}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {camera.enabled ? t("enabled") : t("disabled")}
          </p>
        </div>
        <Link href={`/cameras/${camera.id}/edit`}>
          <Button variant="secondary">{t("edit")}</Button>
        </Link>
      </header>

      {preview}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">{t("zonesSection")}</h2>
          <Link href={`/cameras/${camera.id}/zones/new`}>
            <Button variant="secondary">{t("addZone")}</Button>
          </Link>
        </div>
        {zones.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("emptyZones")}</p>
        ) : (
          <ul className="space-y-2">
            {zones.map((z) => (
              <li key={z.id}>
                <Card>
                  <p className="font-medium text-ink">{z.name}</p>
                  <p className="text-xs text-ink-muted">
                    {z.enabled ? t("enabled") : t("disabled")} · {z.points.length} נקודות
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">{t("linesSection")}</h2>
          <Link href={`/cameras/${camera.id}/lines/new`}>
            <Button variant="secondary">{t("addLine")}</Button>
          </Link>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("emptyLines")}</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((ln) => (
              <li key={ln.id}>
                <Card>
                  <p className="font-medium text-ink">{ln.name}</p>
                  <p className="text-xs text-ink-muted">
                    {ln.enabled ? t("enabled") : t("disabled")} · {ln.direction}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink">{t("rulesSection")}</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("emptyRules")}</p>
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => (
              <li key={r.id}>
                <Link href={`/rules/${r.id}`}>
                  <Card className="hover:bg-muted/40">{r.name}</Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
