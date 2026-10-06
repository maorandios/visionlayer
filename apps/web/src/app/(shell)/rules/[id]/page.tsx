"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { RuleBuilderForm, validateAndBuild } from "@/components/rules/RuleBuilderForm";
import { LoadingBlock } from "@/components/ui/StateBlock";
import { api } from "@/lib/api";
import { ruleToForm, type RuleBuilderForm as RuleForm } from "@/lib/rule-builder";
import type { Camera, Line, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

export default function EditRulePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<RuleForm | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const [rule, cams] = await Promise.all([
        api.rules.get(token, id),
        api.cameras.list(token),
      ]);
      setForm(ruleToForm(rule));
      setCameras(cams);
      const allZones: Zone[] = [];
      const allLines: Line[] = [];
      for (const cam of cams) {
        allZones.push(...(await api.zones.listForCamera(token, cam.id)));
        allLines.push(...(await api.lines.listForCamera(token, cam.id)));
      }
      setZones(allZones);
      setLines(allLines);
      setLoading(false);
    })();
  }, [token, id]);

  async function onSave() {
    if (!token || !form) return;
    const { errors: localErrors, payload } = validateAndBuild(form);
    setErrors(localErrors);
    if (!payload) return;
    setSaving(true);
    try {
      await api.rules.update(token, id, payload);
      router.push("/rules");
    } catch (e) {
      setErrors([e instanceof Error ? e.message : t("errorSave")]);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) return <LoadingBlock />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-ink">{t("edit")}</h1>
      <RuleBuilderForm
        form={form}
        onChange={setForm}
        cameras={cameras}
        zones={zones}
        lines={lines}
        errors={errors}
      />
      <Button onClick={onSave} disabled={saving}>
        {t("save")}
      </Button>
    </div>
  );
}
