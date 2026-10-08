"use client";

/**
 * Catalog of cameras / zones / lines / rules for Hebrew labels and counts in the UI.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";
import { defaultDirectionLabel, type RuleNames } from "@/lib/rule-describe";
import { isFullFrameZone } from "@/lib/rule-wizard/convert";
import type { Camera, Line, Rule, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";

type CatalogValue = {
  cameras: Camera[];
  zones: Zone[];
  lines: Line[];
  rules: Rule[];
  loading: boolean;
  refresh: () => Promise<void>;
  cameraName: (id: string | null | undefined) => string;
  zoneName: (id: string | null | undefined) => string;
  lineName: (id: string | null | undefined) => string;
  ruleName: (id: string | null | undefined) => string;
  zonesForCamera: (cameraId: string) => Zone[];
  linesForCamera: (cameraId: string) => Line[];
  rulesForCamera: (cameraId: string) => Rule[];
  /** Names bundle for describeRule / ruleSentence. */
  ruleNames: RuleNames;
};

const CatalogContext = createContext<CatalogValue | null>(null);

/** Video Lab creates virtual cameras with this id prefix; they are development sources, not real feeds. */
export function isVirtualCamera(camera: Pick<Camera, "id"> | string | null | undefined): boolean {
  const id = typeof camera === "string" ? camera : camera?.id;
  return typeof id === "string" && id.startsWith("vcam_");
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setCameras([]);
      setZones([]);
      setLines([]);
      setRules([]);
      return;
    }
    setLoading(true);
    try {
      const cams = await api.cameras.list(token);
      const [zoneLists, lineLists, ruleList] = await Promise.all([
        Promise.all(cams.map((c) => api.zones.listForCamera(token, c.id))),
        Promise.all(
          cams.map((c) => api.lines.listForCamera(token, c.id).catch(() => [] as Line[])),
        ),
        api.rules.list(token),
      ]);
      setCameras(cams);
      setZones(dedupeById(zoneLists.flat()));
      setLines(dedupeById(lineLists.flat()));
      setRules(dedupeById(ruleList));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<CatalogValue>(() => {
    const camMap = new Map(cameras.map((c) => [c.id, c.name]));
    const zoneMap = new Map(zones.map((z) => [z.id, z.name]));
    const lineMap = new Map(lines.map((l) => [l.id, l.name]));
    const lineById = new Map(lines.map((l) => [l.id, l]));
    const zoneById = new Map(zones.map((z) => [z.id, z]));
    const ruleMap = new Map(rules.map((r) => [r.id, r.name]));
    const cameraName = (id: string | null | undefined) => (id ? camMap.get(id) ?? "—" : "—");
    const zoneName = (id: string | null | undefined) => (id ? zoneMap.get(id) ?? "—" : "—");
    const lineName = (id: string | null | undefined) => (id ? lineMap.get(id) ?? "—" : "—");
    const ruleNames: RuleNames = {
      cameraName,
      zoneName,
      lineName,
      isFullFrameZone: (id) => (id ? isFullFrameZone(zoneById.get(id)) : false),
      directionLabel: (lineId, dir) => {
        const ln = lineId ? lineById.get(lineId) : undefined;
        if (dir === "a_to_b") return ln?.label_a_to_b || defaultDirectionLabel(dir);
        if (dir === "b_to_a") return ln?.label_b_to_a || defaultDirectionLabel(dir);
        return null;
      },
    };
    return {
      cameras,
      zones,
      lines,
      rules,
      loading,
      refresh,
      cameraName,
      zoneName,
      lineName,
      ruleName: (id) => (id ? ruleMap.get(id) ?? "—" : "—"),
      ruleNames,
      zonesForCamera: (cameraId) => zones.filter((z) => z.camera_id === cameraId),
      linesForCamera: (cameraId) => lines.filter((l) => l.camera_id === cameraId),
      rulesForCamera: (cameraId) => rules.filter((r) => r.conditions?.camera_id === cameraId),
    };
  }, [cameras, zones, lines, rules, loading, refresh]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog outside provider");
  return ctx;
}
