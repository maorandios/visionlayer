"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  buildRulePayload,
  DIRECTION_OPTIONS,
  OBJECT_CLASSES,
  OPERATOR_OPTIONS,
  TRIGGER_OPTIONS,
  type RuleBuilderForm,
  validateRuleForm,
} from "@/lib/rule-builder";
import { objectClassHe } from "@/lib/format";
import type { Camera, Line, Zone } from "@/lib/types";
import { t } from "@/i18n/he";

type Props = {
  form: RuleBuilderForm;
  onChange: (form: RuleBuilderForm) => void;
  cameras: Camera[];
  zones: Zone[];
  lines?: Line[];
  errors: string[];
};

export function RuleBuilderForm({ form, onChange, cameras, zones, lines = [], errors }: Props) {
  const set = (patch: Partial<RuleBuilderForm>) => onChange({ ...form, ...patch });
  const filteredZones = zones.filter((z) => z.camera_id === form.cameraId);
  const filteredLines = lines.filter((ln) => ln.camera_id === form.cameraId);
  const needsZone =
    form.trigger === "zone_presence" ||
    form.trigger === "zone_enter" ||
    form.trigger === "zone_exit" ||
    form.trigger === "dwell" ||
    (form.trigger === "count_threshold" && !form.lineId);
  const needsLine = form.trigger === "line_cross" || form.trigger === "count_threshold";
  const showDuration = form.trigger === "dwell" || form.trigger === "zone_presence";
  const showCount = form.trigger === "count_threshold";
  const showDirection = form.trigger === "line_cross" || (form.trigger === "count_threshold" && !!form.lineId);

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
        <Select
          value={form.trigger}
          onChange={(e) =>
            set({
              trigger: e.target.value as RuleBuilderForm["trigger"],
              zoneId: form.zoneId,
              lineId: form.lineId,
            })
          }
        >
          {TRIGGER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </CardSentence>

      <CardSentence>
        <span>{t("camera")}</span>
        <Select
          value={form.cameraId}
          onChange={(e) => set({ cameraId: e.target.value, zoneId: "", lineId: "" })}
        >
          <option value="">—</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </CardSentence>

      {needsZone ? (
        <CardSentence>
          <span>{form.trigger === "zone_exit" ? t("exitsZone") : t("locatedIn")}</span>
          <Select
            value={form.zoneId}
            onChange={(e) => set({ zoneId: e.target.value, lineId: showCount ? "" : form.lineId })}
            disabled={!form.cameraId}
          >
            <option value="">—</option>
            {filteredZones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </CardSentence>
      ) : null}

      {needsLine && (form.trigger === "line_cross" || form.trigger === "count_threshold") ? (
        <CardSentence>
          <span>{form.trigger === "line_cross" ? t("crossesLine") : t("countViaLine")}</span>
          <Select
            value={form.lineId}
            onChange={(e) =>
              set({
                lineId: e.target.value,
                zoneId: e.target.value ? "" : form.zoneId,
              })
            }
            disabled={!form.cameraId}
          >
            <option value="">—</option>
            {filteredLines.map((ln) => (
              <option key={ln.id} value={ln.id}>
                {ln.name}
              </option>
            ))}
          </Select>
        </CardSentence>
      ) : null}

      {showDirection ? (
        <CardSentence>
          <span>{t("directionLabel")}</span>
          <Select
            value={form.direction}
            onChange={(e) => set({ direction: e.target.value as RuleBuilderForm["direction"] })}
          >
            {DIRECTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </CardSentence>
      ) : null}

      {showDuration ? (
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
      ) : null}

      {showCount ? (
        <>
          <CardSentence>
            <span>{t("whenAtLeast")}</span>
            <Select
              value={form.countOperator}
              onChange={(e) =>
                set({ countOperator: e.target.value as RuleBuilderForm["countOperator"] })
              }
            >
              {OPERATOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={1}
              value={form.countThreshold}
              onChange={(e) => set({ countThreshold: Number(e.target.value) })}
            />
            <span>{objectClassHe(form.objectClass)}</span>
          </CardSentence>
          <CardSentence>
            <span>{t("withinWindow")}</span>
            <Input
              type="number"
              min={1}
              value={form.aggregationWindowSeconds}
              onChange={(e) => set({ aggregationWindowSeconds: Number(e.target.value) })}
            />
            <span>{t("seconds")}</span>
          </CardSentence>
        </>
      ) : null}

      <CardSentence>
        <span>{t("between")}</span>
        <Input type="time" value={form.scheduleFrom} onChange={(e) => set({ scheduleFrom: e.target.value })} />
        <Input type="time" value={form.scheduleTo} onChange={(e) => set({ scheduleTo: e.target.value })} />
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
