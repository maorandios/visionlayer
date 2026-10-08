"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { LineEditor } from "@/components/lines/LineEditor";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PolygonEditor } from "@/components/zones/PolygonEditor";
import { CameraSnapshot, useSnapshotUrl } from "@/components/rules/wizard/CameraSnapshot";
import { StepTitle, useWizard } from "@/components/rules/wizard/wizard-context";
import { api } from "@/lib/api";
import type { Point } from "@/lib/polygon";
import { spatialRequirement } from "@/lib/rule-wizard/config";
import type { Line, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

export function StepPlace() {
  const { state } = useWizard();
  const need = spatialRequirement(state.action, state.countMode);
  if (need === "line") return <PlaceLine />;
  return <PlaceZone />;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

function PlaceZone() {
  const { state, choose, zones } = useWizard();
  const [creating, setCreating] = useState(false);
  const list = zones
    .filter((z) => z.camera_id === state.cameraId && z.enabled)
    .filter((z, i, arr) => arr.findIndex((x) => x.id === z.id) === i);
  const question = state.action === "zone_exit" ? "מאיזה אזור?" : "באיזה אזור?";

  if (creating || list.length === 0) {
    return (
      <div className="space-y-4">
        <StepTitle
          title={list.length === 0 ? "סמנו את האזור על התמונה" : "אזור חדש"}
          hint="הקישו על התמונה כדי להוסיף נקודות סביב האזור. אפשר לגרור נקודה כדי לדייק."
        />
        <InlineZoneCreator
          onCancel={list.length === 0 ? undefined : () => setCreating(false)}
          onCreated={(zone) => {
            choose({ zoneId: zone.id });
            setCreating(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StepTitle title={question} hint="בחרו אזור קיים או סמנו אזור חדש על התמונה." />
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="wizard-zone-list">
        {list.map((z, i) => (
          <li key={`${z.id}-${i}`}>
            <PlaceCard
              selected={state.zoneId === z.id}
              name={z.name}
              onClick={() => choose({ zoneId: z.id })}
              preview={<CameraSnapshot cameraId={z.camera_id} zone={z} rounded="rounded-none" className="border-0" />}
              testId="wizard-zone-card"
            />
          </li>
        ))}
        <li>
          <NewPlaceCard label="אזור חדש" onClick={() => setCreating(true)} testId="wizard-zone-new" />
        </li>
      </ul>
    </div>
  );
}

export function InlineZoneCreator({
  onCreated,
  onCancel,
}: {
  onCreated: (zone: Zone) => void;
  onCancel?: () => void;
}) {
  const { token } = useAuth();
  const { state, addZone } = useWizard();
  const bg = useSnapshotUrl(state.cameraId);
  const [name, setName] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token || !state.cameraId) return;
    if (points.length < 3) {
      setError("סמנו לפחות 3 נקודות כדי ליצור אזור.");
      return;
    }
    if (!name.trim()) {
      setError("תנו לאזור שם, למשל \"מחסן\" או \"כניסה ראשית\".");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const zone = await api.zones.create(token, state.cameraId, {
        name: name.trim(),
        kind: "polygon",
        points,
        enabled: true,
      });
      addZone(zone);
      onCreated(zone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירת האזור נכשלה.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="wizard-inline-zone">
      <PolygonEditor points={points} onChange={setPoints} backgroundImageUrl={bg ?? null} />
      <div>
        <label className="mb-1 block text-xs text-ink-muted">איך נקרא לאזור הזה?</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='למשל "מחסן"' />
      </div>
      {error ? <p className="text-sm text-ink">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving}>
          שמור אזור והמשך
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            ביטול
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

function PlaceLine() {
  const { state, choose, lines } = useWizard();
  const [creating, setCreating] = useState(false);
  const list = lines
    .filter((l) => l.camera_id === state.cameraId && l.enabled)
    .filter((l, i, arr) => arr.findIndex((x) => x.id === l.id) === i);

  if (creating || list.length === 0) {
    return (
      <div className="space-y-4">
        <StepTitle
          title={list.length === 0 ? "סמנו את הקו על התמונה" : "קו חדש"}
          hint="הקישו על שתי נקודות כדי למתוח קו, למשל לרוחב השער."
        />
        <InlineLineCreator
          onCancel={list.length === 0 ? undefined : () => setCreating(false)}
          onCreated={(line) => {
            choose({ lineId: line.id });
            setCreating(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StepTitle title="איזה קו?" hint="בחרו קו קיים או סמנו קו חדש על התמונה." />
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="wizard-line-list">
        {list.map((l) => (
          <li key={l.id}>
            <PlaceCard
              selected={state.lineId === l.id}
              name={l.name}
              onClick={() => choose({ lineId: l.id })}
              preview={<CameraSnapshot cameraId={l.camera_id} line={l} rounded="rounded-none" className="border-0" />}
              testId="wizard-line-card"
            />
          </li>
        ))}
        <li>
          <NewPlaceCard label="קו חדש" onClick={() => setCreating(true)} testId="wizard-line-new" />
        </li>
      </ul>
    </div>
  );
}

export function InlineLineCreator({
  onCreated,
  onCancel,
}: {
  onCreated: (line: Line) => void;
  onCancel?: () => void;
}) {
  const { token } = useAuth();
  const { state, addLine } = useWizard();
  const bg = useSnapshotUrl(state.cameraId);
  const [name, setName] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [labelAB, setLabelAB] = useState("כניסה");
  const [labelBA, setLabelBA] = useState("יציאה");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token || !state.cameraId) return;
    if (points.length !== 2) {
      setError("סמנו שתי נקודות כדי ליצור קו.");
      return;
    }
    if (!name.trim()) {
      setError("תנו לקו שם, למשל \"שער כניסה\".");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const line = await api.lines.create(token, state.cameraId, {
        name: name.trim(),
        points,
        direction: "any",
        label_a_to_b: labelAB.trim() || null,
        label_b_to_a: labelBA.trim() || null,
        enabled: true,
      });
      addLine(line);
      onCreated(line);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירת הקו נכשלה.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="wizard-inline-line">
      <LineEditor points={points} onChange={setPoints} backgroundImageUrl={bg ?? null} />
      <div>
        <label className="mb-1 block text-xs text-ink-muted">איך נקרא לקו הזה?</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='למשל "שער כניסה"' />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">כיוון 1 נקרא</label>
          <Input value={labelAB} onChange={(e) => setLabelAB(e.target.value)} placeholder="למשל כניסה" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">כיוון 2 נקרא</label>
          <Input value={labelBA} onChange={(e) => setLabelBA(e.target.value)} placeholder="למשל יציאה" />
        </div>
      </div>
      <p className="text-xs text-ink-muted">אפשר לתת שמות משמעותיים לכל כיוון, למשל ״חוץ״ ו״פנים״ או ״כניסה״ ו״יציאה״.</p>
      {error ? <p className="text-sm text-ink">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving}>
          שמור קו והמשך
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            ביטול
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared cards
// ---------------------------------------------------------------------------

function PlaceCard({
  selected,
  name,
  preview,
  onClick,
  testId,
}: {
  selected: boolean;
  name: string;
  preview: React.ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={testId}
      onClick={onClick}
      className={`w-full overflow-hidden rounded-lg border text-start transition ${
        selected ? "border-accent ring-accent" : "border-border hover:border-border-strong"
      }`}
    >
      {preview}
      <div className="bg-surface px-3 py-2">
        <p className="truncate text-sm font-medium text-ink">{name}</p>
      </div>
    </button>
  );
}

function NewPlaceCard({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-[7rem] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface text-sm font-medium text-ink transition hover:border-accent/50 hover:bg-muted/60 sm:h-full"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
        <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
      </span>
      {label}
    </button>
  );
}