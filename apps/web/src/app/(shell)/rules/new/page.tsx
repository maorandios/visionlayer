"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { RuleBuilderForm, validateAndBuild } from "@/components/rules/RuleBuilderForm";
import { LoadingBlock } from "@/components/ui/StateBlock";
import { api } from "@/lib/api";
import type { RuleBuilderForm as RuleForm } from "@/lib/rule-builder";
import type { Camera, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

const initial: RuleForm = {
  name: "",
  objectClass: "person",
  cameraId: "",
  zoneId: "",
  scheduleFrom: "00:00",
  scheduleTo: "23:59",
  minDurationSeconds: 5,
  cooldownSeconds: 30,
  pushNotification: true,
  enabled: true,
};

function NewRuleInner() {
  const { token } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const presetCamera = search.get("cameraId") ?? "";
  const fromLab = search.get("lab") === "1";
  const presetClass = search.get("objectClass") ?? "";
  const labAssetId = search.get("assetId") ?? "";
  const labRunId = search.get("runId") ?? "";
  const [form, setForm] = useState<RuleForm>({
    ...initial,
    cameraId: presetCamera,
    objectClass: presetClass || initial.objectClass,
    minDurationSeconds: fromLab ? 0 : initial.minDurationSeconds,
    cooldownSeconds: fromLab ? 0 : initial.cooldownSeconds,
  });
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const cams = await api.cameras.list(token);
      setCameras(cams);
      const camId = presetCamera || cams[0]?.id || "";
      const all: Zone[] = [];
      for (const c of cams) all.push(...(await api.zones.listForCamera(token, c.id)));
      setZones(all);
      setForm((f) => ({
        ...f,
        cameraId: f.cameraId || camId,
        zoneId: f.zoneId || all.find((z) => z.camera_id === (f.cameraId || camId))?.id || "",
        objectClass: presetClass || f.objectClass,
        minDurationSeconds: fromLab ? 0 : f.minDurationSeconds,
        cooldownSeconds: fromLab ? 0 : f.cooldownSeconds,
      }));
      setLoading(false);
    })();
  }, [token, presetCamera, presetClass, fromLab]);

  async function onSave() {
    if (!token) return;
    const { errors: localErrors, payload } = validateAndBuild(form);
    setErrors(localErrors);
    if (!payload) return;
    setSaving(true);
    try {
      const remote = await api.rules.validate(token, payload);
      if (!remote.valid) {
        setErrors(remote.errors);
        return;
      }
      const rule = await api.rules.create(token, payload);
      if (fromLab) {
        const params = new URLSearchParams();
        if (labAssetId) params.set("asset", labAssetId);
        if (labRunId) params.set("run", labRunId);
        const q = params.toString();
        router.push(q ? `/dev/video-lab?${q}` : "/dev/video-lab");
      } else {
        router.push(`/rules/${rule.id}`);
      }
    } catch (e) {
      setErrors([e instanceof Error ? e.message : t("errorSave")]);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-ink">{t("addRule")}</h1>
      <RuleBuilderForm
        form={form}
        onChange={setForm}
        cameras={cameras}
        zones={zones}
        errors={errors}
      />
      <Button onClick={onSave} disabled={saving}>
        {t("save")}
      </Button>
    </div>
  );
}

export default function NewRulePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewRuleInner />
    </Suspense>
  );
}
