"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { LoadingBlock } from "@/components/ui/StateBlock";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

export default function EditCameraPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.cameras
      .get(token, id)
      .then((cam) => {
        setName(cam.name);
        setLocation(cam.location ?? "");
      })
      .finally(() => setLoading(false));
  }, [token, id]);

  async function onSave() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.cameras.update(token, id, { name, location: location || null });
      router.push(`/cameras/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold text-ink">{t("edit")}</h1>
      <Card className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">{t("cameraName")}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">{t("cameraLocation")}</label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-ink">{error}</p> : null}
        <Button onClick={onSave} disabled={saving}>
          {t("save")}
        </Button>
      </Card>
    </div>
  );
}
