"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { LineEditor } from "@/components/lines/LineEditor";
import type { Point } from "@/lib/polygon";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

type Props = {
  cameraId: string;
  onDone: () => void;
  compact?: boolean;
};

/** Standalone line create — geometry + name only; rules/metrics set crossing direction later. */
export function LineCreateForm({ cameraId, onDone, compact = false }: Props) {
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
    if (points.length !== 2) {
      setError("נדרשות בדיוק שתי נקודות לקו");
      return;
    }
    if (!name.trim()) {
      setError("תנו לקו שם");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.lines.create(token, cameraId, {
        name: name.trim(),
        points,
        direction: "any",
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
      {!compact ? <h1 className="text-2xl font-semibold text-ink">{t("lineEditorTitle")}</h1> : null}
      <Card className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">{t("lineName")}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='למשל "שער כניסה"' />
        </div>
        <LineEditor points={points} onChange={setPoints} backgroundImageUrl={bgUrl} />
        <p className="text-xs text-ink-muted">
          כיוון המעבר (כניסה / יציאה / חצייה) יוגדר בחוק או במדד — לא כאן.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t("enabled")}
        </label>
        {error ? <p className="text-sm text-ink">{error}</p> : null}
        <Button onClick={() => void onSave()} disabled={saving || !name.trim() || points.length !== 2}>
          {t("save")}
        </Button>
      </Card>
    </div>
  );
}
