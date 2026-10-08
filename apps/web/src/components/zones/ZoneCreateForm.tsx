"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PolygonEditor } from "@/components/zones/PolygonEditor";
import type { Point } from "@/lib/polygon";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

type Props = {
  cameraId: string;
  onDone: () => void;
  compact?: boolean;
};

export function ZoneCreateForm({ cameraId, onDone, compact = false }: Props) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bgUrl, setBgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const blob = await api.cameras.snapshotBlob(token, cameraId);
        objectUrl = URL.createObjectURL(blob);
        setBgUrl(objectUrl);
      } catch {
        setBgUrl(null);
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, cameraId]);

  async function onSave() {
    if (!token) return;
    if (points.length < 3) {
      setError("נדרשות לפחות 3 נקודות");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.zones.create(token, cameraId, {
        name,
        kind: "polygon",
        points,
        enabled,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={compact ? "space-y-3" : "mx-auto max-w-2xl space-y-4"}>
      {!compact ? <h1 className="text-2xl font-semibold text-ink">{t("zoneEditorTitle")}</h1> : null}
      <Card className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">{t("zoneName")}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <PolygonEditor points={points} onChange={setPoints} backgroundImageUrl={bgUrl} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t("enabled")}
        </label>
        {error ? <p className="text-sm text-ink">{error}</p> : null}
        <Button onClick={() => void onSave()} disabled={saving || !name.trim()}>
          {t("save")}
        </Button>
      </Card>
    </div>
  );
}
