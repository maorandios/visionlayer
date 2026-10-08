/**
 * Aggregate operational health for System Status UI.
 * Only uses real readiness signals — never fabricates Jetson/GPU metrics.
 */

import { api } from "@/lib/api";
import type { Camera, HubInfo } from "@/lib/types";

export type HealthLevel = "ok" | "attention" | "down";

export type HealthRow = {
  id: string;
  label: string;
  level: HealthLevel;
  detail: string;
  explanation?: string;
};

export type SystemHealthSnapshot = {
  level: HealthLevel;
  headline: string;
  rows: HealthRow[];
  /** Dev-only expandable details. */
  technical: { label: string; value: string }[];
  camerasOnline: number;
  camerasTotal: number;
};

export type ReadyPayload = {
  status: string;
  checks?: { database?: boolean };
};

export type HealthPayload = {
  status: string;
  service?: string;
  version?: string;
};

export function levelLabelHe(level: HealthLevel): string {
  switch (level) {
    case "ok":
      return "תקין";
    case "attention":
      return "דורש תשומת לב";
    case "down":
      return "לא זמין";
  }
}

export function buildSystemHealth(input: {
  hub: HubInfo | null;
  health: HealthPayload | null;
  ready: ReadyPayload | null;
  cameras: Camera[];
  healthError?: boolean;
}): SystemHealthSnapshot {
  const { hub, health, ready, cameras, healthError } = input;
  const apiOk = !healthError && health?.status === "ok";
  const dbOk = ready?.checks?.database === true;
  const storageOk = dbOk; // SQLite/state — do not expose DB brand to users
  const visionFeature = hub?.features?.video_lab === true || hub?.features?.simulate_detections === true;
  // Honest: vision engine is "available" when API is up; we do not probe detectors here.
  const visionOk = apiOk;

  const online = cameras.filter((c) => c.enabled && c.status === "online").length;
  const total = cameras.length;
  const enabledOffline = cameras.filter((c) => c.enabled && c.status === "offline").length;

  const rows: HealthRow[] = [
    {
      id: "system",
      label: "VisionLayer",
      level: apiOk ? "ok" : "down",
      detail: apiOk ? "פעילה" : "לא זמינה",
      explanation: apiOk ? undefined : "שירות המערכת אינו מגיב כרגע.",
    },
    {
      id: "api",
      label: "שירות מערכת",
      level: apiOk ? "ok" : "down",
      detail: apiOk ? "פעיל" : "לא זמין",
      explanation: apiOk ? undefined : "לא ניתן להתחבר לשירות הליבה.",
    },
    {
      id: "vision",
      label: "מנוע ניתוח",
      level: visionOk ? "ok" : "down",
      detail: visionOk ? "פעיל" : "לא זמין",
      explanation: visionOk
        ? undefined
        : "הניתוח החכם אינו זמין כרגע. הווידאו עשוי עדיין לפעול.",
    },
    {
      id: "cameras",
      label: "מצלמות",
      level: total === 0 ? "attention" : enabledOffline > 0 ? "attention" : "ok",
      detail: total === 0 ? "אין מצלמות" : `${online} מתוך ${total} פעילות`,
      explanation:
        total === 0
          ? "הוסיפו מצלמה כדי להתחיל."
          : enabledOffline > 0
            ? "חלק מהמצלמות אינן זמינות."
            : undefined,
    },
    {
      id: "storage",
      label: "אחסון",
      level: storageOk ? "ok" : ready ? "down" : "attention",
      detail: storageOk ? "זמין" : ready ? "לא זמין" : "לא נבדק",
      explanation: storageOk ? undefined : "שמירת מצב המערכת נכשלה.",
    },
  ];

  const worst: HealthLevel = rows.some((r) => r.level === "down")
    ? "down"
    : rows.some((r) => r.level === "attention")
      ? "attention"
      : "ok";

  const headline =
    worst === "ok" ? "המערכת פעילה" : worst === "attention" ? "דורש תשומת לב" : "המערכת לא זמינה";

  const technical: { label: string; value: string }[] = [];
  if (hub) {
    technical.push({ label: "גרסה", value: hub.version });
    technical.push({ label: "סביבה", value: hub.environment });
  }
  if (health?.service) technical.push({ label: "שירות", value: health.service });
  if (health?.version) technical.push({ label: "גרסת API", value: health.version });
  technical.push({ label: "מוכנות", value: ready?.status ?? "—" });
  technical.push({ label: "מסד נתונים", value: dbOk ? "ok" : "fail" });
  if (visionFeature) technical.push({ label: "Video Lab", value: "enabled" });

  return {
    level: worst,
    headline,
    rows,
    technical,
    camerasOnline: online,
    camerasTotal: total,
  };
}

export async function fetchSystemHealth(token: string | null, hub: HubInfo | null): Promise<SystemHealthSnapshot> {
  let health: HealthPayload | null = null;
  let ready: ReadyPayload | null = null;
  let cameras: Camera[] = [];
  let healthError = false;
  try {
    health = await api.health();
  } catch {
    healthError = true;
  }
  try {
    ready = await api.ready();
  } catch {
    ready = null;
  }
  if (token) {
    try {
      cameras = await api.cameras.list(token);
    } catch {
      cameras = [];
    }
  }
  return buildSystemHealth({ hub, health, ready, cameras, healthError });
}
