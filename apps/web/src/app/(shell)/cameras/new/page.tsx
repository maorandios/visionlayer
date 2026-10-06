"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { t } from "@/i18n/he";

export default function NewCameraPage() {
  const { token } = useAuth();
  const { refresh } = useCatalog();
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const cam = await api.cameras.create(token, {
        name,
        location: location || null,
        enabled: true,
      });
      await refresh();
      router.push(`/cameras/${cam.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold text-ink">{t("addCamera")}</h1>
      <Card className="space-y-3">
        <Field label={t("cameraName")} value={name} onChange={setName} />
        <Field label={t("cameraLocation")} value={location} onChange={setLocation} />
        {error ? <p className="text-sm text-ink">{error}</p> : null}
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving || !name.trim()}>
            {t("save")}
          </Button>
          <Button variant="secondary" onClick={() => router.back()}>
            {t("cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-ink-muted">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
