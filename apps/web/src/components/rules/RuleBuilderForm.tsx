"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  buildRulePayload,
  OBJECT_CLASSES,
  type RuleBuilderForm,
  validateRuleForm,
} from "@/lib/rule-builder";
import { objectClassHe } from "@/lib/format";
import type { Camera, Zone } from "@/lib/types";
import { t } from "@/i18n/he";

type Props = {
  form: RuleBuilderForm;
  onChange: (form: RuleBuilderForm) => void;
  cameras: Camera[];
  zones: Zone[];
  errors: string[];
};

export function RuleBuilderForm({ form, onChange, cameras, zones, errors }: Props) {
  const set = (patch: Partial<RuleBuilderForm>) => onChange({ ...form, ...patch });
  const filteredZones = zones.filter((z) => z.camera_id === form.cameraId);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-ink-muted">{t("ruleBuilderTitle")}</label>
        <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </div>

      <CardSentence>
        <span>{t("when")}</span>
        <Select value={form.objectClass} onChange={(e) => set({ objectClass: e.target.value })}>
          {OBJECT_CLASSES.map((c) => (
            <option key={c} value={c}>
              {objectClassHe(c)}
            </option>
          ))}
        </Select>
        <span>{t("locatedIn")}</span>
        <Select value={form.cameraId} onChange={(e) => set({ cameraId: e.target.value, zoneId: "" })}>
          <option value="">—</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={form.zoneId} onChange={(e) => set({ zoneId: e.target.value })} disabled={!form.cameraId}>
          <option value="">—</option>
          {filteredZones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
      </CardSentence>

      <CardSentence>
        <span>{t("between")}</span>
        <Input type="time" value={form.scheduleFrom} onChange={(e) => set({ scheduleFrom: e.target.value })} />
        <Input type="time" value={form.scheduleTo} onChange={(e) => set({ scheduleTo: e.target.value })} />
      </CardSentence>

      <CardSentence>
        <span>{t("forMoreThan")}</span>
        <Input
          type="number"
          min={0}
          value={form.minDurationSeconds}
          onChange={(e) => set({ minDurationSeconds: Number(e.target.value) })}
        />
        <span>{t("seconds")}</span>
      </CardSentence>

      <CardSentence>
        <span>{t("then")}</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.pushNotification}
            onChange={(e) => set({ pushNotification: e.target.checked })}
          />
          {t("sendAlert")}
        </label>
      </CardSentence>

      <div>
        <label className="mb-1 block text-xs text-ink-muted">Cooldown (שניות)</label>
        <Input
          type="number"
          min={0}
          value={form.cooldownSeconds}
          onChange={(e) => set({ cooldownSeconds: Number(e.target.value) })}
        />
      </div>

      {errors.length > 0 ? (
        <ul className="rounded-xl border border-border bg-muted p-3 text-sm text-ink">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CardSentence({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 text-sm">
      {children}
    </div>
  );
}

export function validateAndBuild(form: RuleBuilderForm) {
  const errors = validateRuleForm(form);
  return { errors, payload: errors.length === 0 ? buildRulePayload(form) : null };
}
